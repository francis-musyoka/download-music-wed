import { callOpenAI, OpenAIError } from "./client.ts";
import { LLM_CONFIG } from "./config.ts";
import { RerankResultSchema } from "./schemas.ts";
import { RERANK_PROMPT_V1 } from "./prompts.ts";
import type {
  RerankCandidate,
  RerankDecision,
  UnderstoodArtist,
  UnderstoodGenre,
} from "./types.ts";

export interface RerankArgs {
  mode: "genre" | "artist";
  intent: UnderstoodGenre | UnderstoodArtist;
  candidates: RerankCandidate[];
  limit: number;
  jobId?: string;
}

export interface RerankOk {
  ok: true;
  kept: RerankDecision[];
  dropped: RerankDecision[];
}
export interface RerankDegrade {
  ok: false;
  reason: string;
}

export async function rerankCandidatesSafe(
  args: RerankArgs,
): Promise<RerankOk | RerankDegrade> {
  if (args.candidates.length === 0) {
    return { ok: true, kept: [], dropped: [] };
  }
  if (!LLM_CONFIG.enabled) return { ok: false, reason: "llm disabled" };

  const userPrompt = JSON.stringify({
    mode: args.mode,
    intent: args.intent,
    limit: args.limit,
    candidates: args.candidates,
  });

  try {
    const { data } = await callOpenAI({
      model: LLM_CONFIG.modelSmart,
      systemPrompt: RERANK_PROMPT_V1,
      userPrompt,
      schema: RerankResultSchema,
      schemaName: "RerankResult",
      timeoutMs: LLM_CONFIG.timeoutRerankMs,
      purpose: "rerank",
      jobId: args.jobId,
      mode: args.mode,
    });

    // Validate id-integrity: every decision id must match an input id.
    const validIds = new Set(args.candidates.map((c) => c.id));
    const clean = data.results.filter((r) => validIds.has(r.id));

    const kept = clean.filter((r) => r.keep);
    const dropped = clean.filter((r) => !r.keep);
    return { ok: true, kept, dropped };
  } catch (err) {
    const msg =
      err instanceof OpenAIError
        ? `${err.code}: ${err.message}`
        : (err as Error).message;
    return { ok: false, reason: msg };
  }
}

export function summarizeRejectCategories(
  decisions: RerankDecision[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of decisions) {
    if (d.rejectCategory) {
      out[d.rejectCategory] = (out[d.rejectCategory] ?? 0) + 1;
    }
  }
  return out;
}
