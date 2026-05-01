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
    // Cache successful resolutions only. Rejections are NOT cached — prompt
    // iteration changes what the model classifies as a valid artist/genre,
    // and a stale rejection blocks the user from a now-acceptable input
    // until the process restarts. Re-deriving a rejection on the next call
    // costs ~$0.0002, which is negligible vs the UX cost of stale rejects.
    if (data.rejectReason) {
      return { ok: false, reason: "rejected", message: data.rejectReason };
    }
    understandCache.set(key, data);
    return { ok: true, data };
  } catch (err) {
    // Do NOT cache transient failures.
    if (err instanceof OpenAIError) {
      return { ok: false, reason: "degrade", message: `${err.code}: ${err.message}` };
    }
    return { ok: false, reason: "degrade", message: (err as Error).message };
  }
}
