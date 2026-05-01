import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";
import pino from "pino";
import { LLM_CONFIG } from "./config.ts";

const log = pino({ name: "llm" });

let clientSingleton: OpenAI | null = null;

function getClient(): OpenAI {
  if (clientSingleton) return clientSingleton;
  if (!LLM_CONFIG.apiKey) {
    throw new OpenAIError("no-key", "OPENAI_API_KEY missing");
  }
  clientSingleton = new OpenAI({
    apiKey: LLM_CONFIG.apiKey,
    baseURL: LLM_CONFIG.baseUrl,
    maxRetries: 0, // we handle retries ourselves so we control backoff
  });
  return clientSingleton;
}

export type LLMPurpose = "understand" | "rerank";
export type LLMErrorCode =
  | "no-key"
  | "timeout"
  | "http-4xx"
  | "http-429"
  | "http-5xx"
  | "parse"
  | "network";

export class OpenAIError extends Error {
  code: LLMErrorCode;
  constructor(code: LLMErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "OpenAIError";
  }
}

export interface CallParams<T> {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schema: z.ZodSchema<T>;
  schemaName: string;
  timeoutMs: number;
  purpose: LLMPurpose;
  jobId?: string;
  mode?: string;
}

export interface CallMeta {
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  retries: number;
}

function classifyError(err: unknown): LLMErrorCode {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: number }).status;
    if (status === 408) return "timeout";
    if (status === 429) return "http-429";
    if (typeof status === "number" && status >= 500) return "http-5xx";
    if (typeof status === "number" && status >= 400) return "http-4xx";
  }
  if (err instanceof Error && err.name === "AbortError") return "timeout";
  return "network";
}

function isRetryable(code: LLMErrorCode): boolean {
  return code === "timeout" || code === "http-429" || code === "http-5xx" || code === "network";
}

// Scrub header-like secrets from any object before logging.
function scrub<T>(v: T): T {
  if (!v || typeof v !== "object") return v;
  const copy: Record<string, unknown> = { ...(v as Record<string, unknown>) };
  for (const k of Object.keys(copy)) {
    if (/^authorization$/i.test(k) || /api[-_]?key/i.test(k)) {
      copy[k] = "[redacted]";
    }
  }
  return copy as T;
}

async function callOnce<T>(p: CallParams<T>): Promise<{
  parsed: T;
  usage: { input?: number; output?: number; cached?: number };
}> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), p.timeoutMs);
  try {
    const client = getClient();
    const resp = await client.chat.completions.create(
      {
        model: p.model,
        temperature: p.purpose === "understand" ? 0.1 : 0.2,
        messages: [
          { role: "system", content: p.systemPrompt },
          { role: "user", content: p.userPrompt },
        ],
        response_format: zodResponseFormat(p.schema, p.schemaName),
      },
      { signal: ac.signal },
    );
    const raw = resp.choices[0]?.message.content ?? "";
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      throw new OpenAIError("parse", `non-JSON LLM response: ${(err as Error).message}`);
    }
    const parsed = p.schema.parse(json);
    return {
      parsed,
      usage: {
        input: resp.usage?.prompt_tokens,
        output: resp.usage?.completion_tokens,
        cached: resp.usage?.prompt_tokens_details?.cached_tokens,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function callOpenAI<T>(p: CallParams<T>): Promise<{ data: T; meta: CallMeta }> {
  if (!LLM_CONFIG.enabled) throw new OpenAIError("no-key", "LLM disabled");
  const start = Date.now();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await callOnce(p);
      const latencyMs = Date.now() - start;
      log.info(
        scrub({
          llm: p.purpose,
          model: p.model,
          jobId: p.jobId,
          mode: p.mode,
          latencyMs,
          inputTokens: out.usage.input,
          outputTokens: out.usage.output,
          cachedTokens: out.usage.cached,
          retries: attempt,
        }),
        "llm_call",
      );
      return {
        data: out.parsed,
        meta: {
          latencyMs,
          inputTokens: out.usage.input,
          outputTokens: out.usage.output,
          cachedTokens: out.usage.cached,
          retries: attempt,
        },
      };
    } catch (err) {
      const code = err instanceof OpenAIError ? err.code : classifyError(err);
      lastErr = err instanceof OpenAIError ? err : new OpenAIError(code, (err as Error).message);
      log.warn(
        scrub({
          llm: p.purpose,
          model: p.model,
          jobId: p.jobId,
          attempt,
          code,
        }),
        "llm_call_error",
      );
      if (!isRetryable(code) || attempt === 1) throw lastErr;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastErr;
}
