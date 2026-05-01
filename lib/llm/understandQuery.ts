import { callOpenAI, OpenAIError } from "./client.ts";
import { LLM_CONFIG } from "./config.ts";
import {
  UnderstoodArtistSchema,
  UnderstoodGenreSchema,
  UnderstoodSongSchema,
} from "./schemas.ts";
import {
  UNDERSTAND_ARTIST_PROMPT_V1,
  UNDERSTAND_GENRE_PROMPT_V1,
  UNDERSTAND_SONG_PROMPT_V1,
} from "./prompts.ts";
import type {
  UnderstoodArtist,
  UnderstoodGenre,
  UnderstoodQuery,
  UnderstoodSong,
} from "./types.ts";
import { understandCache, normalizeCacheKey } from "./understandCache.ts";
import { createRequire } from "node:module";
const requireCjs = createRequire(import.meta.url);
const { getGenreConfig } = requireCjs("../pipeline/config/genres") as {
  getGenreConfig: (name: string) => {
    key: string;
    config: { displayName: string; searchTerms?: string[] };
    knownGenre: boolean;
  };
};

export interface UnderstandInputs {
  genre: string;
  artist: string;
  song: { title: string; artist: string };
}

export async function understandGenre(
  input: string,
  jobId?: string,
): Promise<UnderstoodGenre> {
  const { data } = await callOpenAI({
    model: LLM_CONFIG.modelFast,
    systemPrompt: UNDERSTAND_GENRE_PROMPT_V1,
    userPrompt: JSON.stringify({ input }),
    schema: UnderstoodGenreSchema,
    schemaName: "UnderstoodGenre",
    timeoutMs: LLM_CONFIG.timeoutUnderstandMs,
    purpose: "understand",
    jobId,
    mode: "genre",
  });
  return { mode: "genre", ...data };
}

export async function understandArtist(
  input: string,
  jobId?: string,
): Promise<UnderstoodArtist> {
  const { data } = await callOpenAI({
    model: LLM_CONFIG.modelFast,
    systemPrompt: UNDERSTAND_ARTIST_PROMPT_V1,
    userPrompt: JSON.stringify({ input }),
    schema: UnderstoodArtistSchema,
    schemaName: "UnderstoodArtist",
    timeoutMs: LLM_CONFIG.timeoutUnderstandMs,
    purpose: "understand",
    jobId,
    mode: "artist",
  });
  return { mode: "artist", ...data };
}

export async function understandSong(
  input: { title: string; artist: string },
  jobId?: string,
): Promise<UnderstoodSong> {
  const { data } = await callOpenAI({
    model: LLM_CONFIG.modelFast,
    systemPrompt: UNDERSTAND_SONG_PROMPT_V1,
    userPrompt: JSON.stringify(input),
    schema: UnderstoodSongSchema,
    schemaName: "UnderstoodSong",
    timeoutMs: LLM_CONFIG.timeoutUnderstandMs,
    purpose: "understand",
    jobId,
    mode: "song",
  });
  return { mode: "song", ...data };
}

// Returns a synthetic UnderstoodGenre built from the static allowlist config
// when the user's input matches a known genre. Avoids a round-trip to OpenAI
// for the most common case. Returns null for unknown genres; caller falls
// through to the LLM path.
function tryGenreAllowlist(input: string): UnderstoodGenre | null {
  const { config, knownGenre } = getGenreConfig(input);
  if (!knownGenre) return null;
  const synthetic: UnderstoodGenre = {
    mode: "genre",
    canonicalGenre: config.displayName,
    displayName: config.displayName,
    knownGenre: true,
    spellCorrected: false,
    originalInput: input,
    // Schema caps at 6 items; slice defensively in case a config grows past that.
    searchTerms: (config.searchTerms ?? []).slice(0, 6),
  };
  UnderstoodGenreSchema.parse({
    canonicalGenre: synthetic.canonicalGenre,
    displayName: synthetic.displayName,
    knownGenre: synthetic.knownGenre,
    spellCorrected: synthetic.spellCorrected,
    originalInput: synthetic.originalInput,
    searchTerms: synthetic.searchTerms,
  });
  return synthetic;
}

// Never throws on recoverable failures — returns null so the orchestrator can
// degrade to raw-input search. The only error that propagates is a hard
// rejectReason from the LLM, which should fail the job.
export async function understandQuerySafe<M extends keyof UnderstandInputs>(args: {
  mode: M;
  input: UnderstandInputs[M];
  jobId?: string;
}): Promise<{ ok: true; data: UnderstoodQuery } | { ok: false; reason: "degrade" | "rejected"; message: string }> {
  if (!LLM_CONFIG.enabled) {
    return { ok: false, reason: "degrade", message: "llm disabled" };
  }

  // Genre allowlist shortcircuit — cheaper than any cache read.
  if (args.mode === "genre") {
    const shortcut = tryGenreAllowlist(args.input as string);
    if (shortcut) return { ok: true, data: shortcut };
  }

  // LRU cache lookup.
  const key = normalizeCacheKey(args.mode, args.input as string | { title: string; artist: string });
  const cached = understandCache.get(key);
  if (cached) {
    if (cached.rejectReason) {
      return { ok: false, reason: "rejected", message: cached.rejectReason };
    }
    return { ok: true, data: cached };
  }

  try {
    let data: UnderstoodQuery;
    if (args.mode === "genre") {
      data = await understandGenre(args.input as string, args.jobId);
    } else if (args.mode === "artist") {
      data = await understandArtist(args.input as string, args.jobId);
    } else {
      data = await understandSong(
        args.input as { title: string; artist: string },
        args.jobId,
      );
    }
    // Cache success AND hard-reject results — both are stable.
    understandCache.set(key, data);
    if (data.rejectReason) {
      return { ok: false, reason: "rejected", message: data.rejectReason };
    }
    return { ok: true, data };
  } catch (err) {
    // Do NOT cache transient failures.
    if (err instanceof OpenAIError) {
      return { ok: false, reason: "degrade", message: `${err.code}: ${err.message}` };
    }
    return { ok: false, reason: "degrade", message: (err as Error).message };
  }
}
