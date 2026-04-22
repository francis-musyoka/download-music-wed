// Resolves LLM configuration from environment once at module load.
// Importers must only run server-side (routes, pipeline modules). Never
// imported from client components — the OpenAI key must not ship to the browser.

const BOOL_TRUE = new Set(["1", "true", "yes", "on"]);

function parseBool(raw: string | undefined, defaultVal: boolean): boolean {
  if (!raw) return defaultVal;
  return BOOL_TRUE.has(raw.toLowerCase());
}

function parseInt10(raw: string | undefined, defaultVal: number): number {
  if (!raw) return defaultVal;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultVal;
}

export const LLM_CONFIG = {
  apiKey: process.env.OPENAI_API_KEY ?? "",
  enabled:
    parseBool(process.env.OPENAI_ENABLED, true) &&
    !!process.env.OPENAI_API_KEY,
  modelFast: process.env.OPENAI_MODEL_FAST ?? "gpt-4o-mini",
  modelSmart: process.env.OPENAI_MODEL_SMART ?? "gpt-4o",
  timeoutUnderstandMs: parseInt10(process.env.OPENAI_TIMEOUT_UNDERSTAND_MS, 5000),
  timeoutRerankMs: parseInt10(process.env.OPENAI_TIMEOUT_RERANK_MS, 15000),
  // Base URL override for local test fakes; leave undefined in prod.
  baseUrl: process.env.OPENAI_BASE_URL || undefined,
} as const;

export type LLMConfig = typeof LLM_CONFIG;
