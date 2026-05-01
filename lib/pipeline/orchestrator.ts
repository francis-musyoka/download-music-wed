import { basename, extname } from "node:path";
import { statSync } from "node:fs";
import type { DownloadedTrack, ProgressEvent, Track } from "../types";
import { ensureDirs } from "./deps";
import { understandQuerySafe } from "../llm/understandQuery.ts";
import {
  rerankCandidatesSafe,
  summarizeRejectCategories,
} from "../llm/rerankCandidates.ts";
import type { RerankCandidate } from "../llm/types.ts";
import { applyNoiseFilter } from "./scoring/noiseFilter.ts";
import { fetchUploadDates } from "./enrich/uploadDates.ts";

// ── CommonJS pipeline modules (ported from the CLI, byte-for-byte) ──
// eslint-disable-next-line @typescript-eslint/no-require-imports
const spotifyMod = require("./scrapers/spotify") as {
  collectCandidates: (
    genre: string,
    opts?: { extraSearchTerms?: string[] },
  ) => Promise<Track[]>;
  collectArtistCandidates: (artist: string) => Promise<Track[]>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const youtubeMod = require("./scrapers/youtube") as {
  searchYouTube: (query: string, count?: number) => Promise<YtSearchResult[]>;
  findBestMatch: (artist: string, title: string) => Promise<YtSearchResult | null>;
  downloadTrack: (url: string, outputDir?: string) => Promise<string | null>;
  searchAndDownload: (
    artist: string,
    title: string,
    outputDir?: string,
  ) => Promise<{ filePath: string; videoData: YtSearchResult } | null>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const hitScoreMod = require("./scoring/hitScore") as {
  rankCandidates: (candidates: Track[]) => Track[];
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const diversityMod = require("./scoring/diversity") as {
  applyDiversityCap: (ranked: Track[], maxPerArtist?: number) => Track[];
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const m3uMod = require("./playlist/m3u") as {
  generateM3U: (opts: {
    name: string;
    tracks: Array<{
      filePath: string;
      title: string;
      artist: string | null;
      duration?: number;
    }>;
    outputDir?: string;
  }) => string;
  generateM3UFromFiles: (
    name: string,
    filePaths: string[],
    outputDir?: string,
  ) => string;
  getExistingSongs: () => Set<string>;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const formatMod = require("./utils/format") as {
  isMixOrCompilation: (title: string) => boolean;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const constantsMod = require("./config/constants") as {
  MUSIC_DIR: string;
  MAX_DURATION: number;
  MIN_DURATION: number;
  DEFAULT_LIMIT: number;
};

const { collectCandidates, collectArtistCandidates } = spotifyMod;
const { searchYouTube, findBestMatch, downloadTrack, searchAndDownload } =
  youtubeMod;
const { rankCandidates } = hitScoreMod;
const { applyDiversityCap } = diversityMod;
const { generateM3U, generateM3UFromFiles, getExistingSongs } = m3uMod;
const { isMixOrCompilation } = formatMod;
const { MUSIC_DIR, MAX_DURATION, MIN_DURATION, DEFAULT_LIMIT } = constantsMod;

interface YtSearchResult {
  videoId: string;
  title: string;
  url: string;
  views: number;
  duration: number;
  uploadDate: string | null;
  channel: string;
}

export type OnProgress = (ev: Omit<ProgressEvent, "jobId">) => void;

export interface RankOptions {
  limit?: number;
  onProgress?: OnProgress;
  jobId?: string;
}

export interface DownloadOptions {
  tracks: Track[];
  playlistName?: string;
  onProgress?: OnProgress;
}

export interface RankResult {
  tracks: Track[];
  note?: string;
}

// ── Helpers ──

function noop(_ev: Omit<ProgressEvent, "jobId">): void {
  // Default no-op so callers without a listener don't pay a conditional.
}

function dedupeAgainstLibrary(candidates: Track[]): Track[] {
  const existing = getExistingSongs();
  return candidates.filter((c) => {
    const titleLower = (c.title || "").toLowerCase();
    const artistTitle = `${c.artist || ""} - ${c.title || ""}`.toLowerCase();
    return !existing.has(titleLower) && !existing.has(artistTitle);
  });
}

/**
 * YouTube search fallback when Spotify scraping returns zero candidates.
 * Mirrors `youtubeSearchFallback` in the CLI's pipeline.js.
 */
async function scrapeYTMusicFallback(
  genre: string,
  count: number,
): Promise<Track[]> {
  const query = `${genre} official music video ${new Date().getFullYear()}`;
  const results = await searchYouTube(query, count);

  return results
    .filter((r) => {
      if (r.duration > MAX_DURATION) return false;
      if (r.duration < MIN_DURATION) return false;
      if (isMixOrCompilation(r.title)) return false;
      return true;
    })
    .map((r) => ({
      title: r.title,
      artist: r.channel || "Unknown",
      channel: r.channel,
      playlistCount: 1,
      bestPosition: 50,
      views: r.views,
      duration: r.duration,
      uploadDate: r.uploadDate ?? undefined,
      videoUrl: r.url,
      videoId: r.videoId,
      source: "youtube",
    }));
}

async function enrichCandidates(
  candidates: Track[],
  onProgress: OnProgress,
): Promise<void> {
  // Sequential by design: the CLI enriches one-at-a-time because YouTube
  // search is rate-limited. Do NOT parallelize.
  const needsEnrichment = candidates.filter((c) => !c.videoId);
  if (needsEnrichment.length === 0) return;

  onProgress({
    stage: "enriching-youtube",
    current: 0,
    total: needsEnrichment.length,
    message: `Sourcing audio for ${needsEnrichment.length} candidates`,
  });

  for (let i = 0; i < needsEnrichment.length; i++) {
    const candidate = needsEnrichment[i];
    try {
      const match = await findBestMatch(candidate.artist, candidate.title);
      if (match) {
        candidate.views = match.views;
        candidate.duration = match.duration;
        candidate.uploadDate = match.uploadDate ?? undefined;
        candidate.videoUrl = match.url;
        candidate.videoId = match.videoId;
      }
    } catch {
      // Skip enrichment failures silently (matches CLI behavior).
    }
    onProgress({
      stage: "enriching-youtube",
      current: i + 1,
      total: needsEnrichment.length,
    });
  }

  // Ensure videoUrl is set for every candidate that has a videoId.
  for (const c of candidates) {
    if (c.videoId && !c.videoUrl) {
      c.videoUrl = `https://www.youtube.com/watch?v=${c.videoId}`;
    }
  }
}

function toDownloadedTrack(
  filePath: string,
  title: string,
  artist: string,
  duration: number | undefined,
): DownloadedTrack {
  const fileName = basename(filePath);
  let sizeBytes: number | undefined;
  try {
    sizeBytes = statSync(filePath).size;
  } catch {
    sizeBytes = undefined;
  }
  return { filePath, fileName, title, artist, duration, sizeBytes };
}

// ── Ranking entry points ──

export async function rankGenre(
  genre: string,
  opts: RankOptions = {},
): Promise<RankResult> {
  ensureDirs();
  const onProgress = opts.onProgress ?? noop;
  const limit = opts.limit ?? DEFAULT_LIMIT;

  // ── Hook 1: Query understanding ──
  onProgress({ stage: "understanding-query", message: "Understanding query" });
  const understood = await understandQuerySafe({
    mode: "genre",
    input: genre,
    jobId: opts.jobId,
  });
  if (!understood.ok && understood.reason === "rejected") {
    throw new Error(understood.message);
  }
  const intent =
    understood.ok && understood.data.mode === "genre" ? understood.data : null;
  const effectiveGenre = intent?.canonicalGenre ?? genre;
  if (!understood.ok) {
    onProgress({
      stage: "llm-degraded",
      degradeStep: "understand",
      message: understood.message,
    });
  }

  // ── Scrape ──
  onProgress({
    stage: "scraping-spotify",
    message: `Collecting candidates for "${effectiveGenre}"`,
  });
  let candidates = await collectCandidates(effectiveGenre, {
    extraSearchTerms: intent?.searchTerms ?? [],
  });
  if (candidates.length === 0) {
    onProgress({
      stage: "scraping-spotify",
      message: "First crate came up empty — widening the search",
    });
    const query = intent?.searchTerms?.[0] ?? effectiveGenre;
    candidates = await scrapeYTMusicFallback(query, limit * 3);
  }
  if (candidates.length === 0) {
    throw new Error(`No songs found for genre "${effectiveGenre}".`);
  }

  // ── Enrich + dedupe + noise filter (no LLM cost) ──
  // enrichCandidates and fetchUploadDates operate on disjoint subsets:
  // the former sets videoId on candidates that lack one; the latter reads
  // videoId on candidates that already have one. They can run concurrently.
  await Promise.all([
    enrichCandidates(candidates, onProgress),
    fetchUploadDates(candidates, { onProgress }),
  ]);
  candidates = applyNoiseFilter(candidates, "genre");
  candidates = dedupeAgainstLibrary(candidates);
  if (candidates.length === 0) {
    return { tracks: [] };
  }

  // ── Score (manual ranking) ──
  onProgress({ stage: "scoring", message: "Scoring and ranking candidates" });
  const ranked = rankCandidates(candidates);

  // ── Cap to top 100 by hitScore before LLM classifier ──
  const LLM_INPUT_CAP = 100;
  const llmInput = ranked.slice(0, LLM_INPUT_CAP);

  // ── Hook 2: LLM keep/reject classifier ──
  let kept: Track[] = llmInput;
  if (intent) {
    onProgress({
      stage: "llm-reranking",
      message: `Classifying ${llmInput.length} candidates`,
    });
    const result = await rerankCandidatesSafe({
      mode: "genre",
      intent,
      candidates: llmInput.map<RerankCandidate>((c) => ({
        id: c.videoId ? `v:${c.videoId}` : `c:${c.artist}__${c.title}`,
        title: c.title,
        artist: c.artist,
        channel: c.channel,
        durationSec: c.duration,
      })),
      jobId: opts.jobId,
    });

    if (result.ok) {
      const keepIds = new Set(result.kept.map((d) => d.id));
      const idOf = (c: Track) =>
        c.videoId ? `v:${c.videoId}` : `c:${c.artist}__${c.title}`;
      // Survivors keep their hitScore order — manual rank is the final ranker.
      kept = llmInput.filter((c) => keepIds.has(idOf(c)));
      onProgress({
        stage: "llm-reranked",
        message: "Classification complete",
        rerankSummary: {
          kept: result.kept.length,
          dropped: result.dropped.length,
          rejectCategories: summarizeRejectCategories(result.dropped),
        },
      });
    } else {
      onProgress({
        stage: "llm-degraded",
        degradeStep: "rerank",
        message: result.reason,
      });
      // Degrade: trust manual rank only over the same top-100 pool the
      // happy path would have seen. Keeps results consistent across
      // LLM-up and LLM-down states.
      kept = llmInput;
    }
  }

  // ── Diversity cap + slice to N ──
  const diverse = applyDiversityCap(kept);
  const selected = diverse.slice(0, limit);
  let note: string | undefined;
  if (intent && selected.length < limit) {
    note = `Only ${selected.length} high-confidence ${intent.displayName} tracks found — try a broader query or lower the count.`;
  }
  return { tracks: selected, note };
}

export async function rankArtist(
  artist: string,
  opts: RankOptions = {},
): Promise<RankResult> {
  ensureDirs();
  const onProgress = opts.onProgress ?? noop;
  const limit = opts.limit ?? 5;

  onProgress({ stage: "understanding-query", message: "Understanding query" });
  const understood = await understandQuerySafe({
    mode: "artist",
    input: artist,
    jobId: opts.jobId,
  });
  if (!understood.ok && understood.reason === "rejected") {
    throw new Error(understood.message);
  }
  const intent =
    understood.ok && understood.data.mode === "artist" ? understood.data : null;
  const effectiveArtist = intent?.canonicalArtist ?? artist;
  if (!understood.ok) {
    onProgress({
      stage: "llm-degraded",
      degradeStep: "understand",
      message: understood.message,
    });
  }

  onProgress({
    stage: "scraping-spotify",
    message: `Collecting top songs for "${effectiveArtist}"`,
  });
  let candidates = await collectArtistCandidates(effectiveArtist);
  if (candidates.length === 0) {
    throw new Error(`No songs found for artist "${effectiveArtist}".`);
  }

  await fetchUploadDates(candidates, { onProgress });
  candidates = applyNoiseFilter(candidates, "artist");
  candidates = dedupeAgainstLibrary(candidates);
  if (candidates.length === 0) {
    return { tracks: [] };
  }

  onProgress({ stage: "scoring", message: "Scoring and ranking" });
  const ranked = rankCandidates(candidates);

  const LLM_INPUT_CAP = 100;
  const llmInput = ranked.slice(0, LLM_INPUT_CAP);

  let kept: Track[] = llmInput;
  if (intent) {
    onProgress({
      stage: "llm-reranking",
      message: `Classifying ${llmInput.length} candidates`,
    });
    const result = await rerankCandidatesSafe({
      mode: "artist",
      intent,
      candidates: llmInput.map<RerankCandidate>((c) => ({
        id: c.videoId ? `v:${c.videoId}` : `c:${c.artist}__${c.title}`,
        title: c.title,
        artist: c.artist,
        channel: c.channel,
        durationSec: c.duration,
      })),
      jobId: opts.jobId,
    });

    if (result.ok) {
      const keepIds = new Set(result.kept.map((d) => d.id));
      const idOf = (c: Track) =>
        c.videoId ? `v:${c.videoId}` : `c:${c.artist}__${c.title}`;
      kept = llmInput.filter((c) => keepIds.has(idOf(c)));
      onProgress({
        stage: "llm-reranked",
        message: "Classification complete",
        rerankSummary: {
          kept: result.kept.length,
          dropped: result.dropped.length,
          rejectCategories: summarizeRejectCategories(result.dropped),
        },
      });
    } else {
      onProgress({
        stage: "llm-degraded",
        degradeStep: "rerank",
        message: result.reason,
      });
      kept = llmInput;
    }
  }

  const selected = kept.slice(0, limit);
  let note: string | undefined;
  if (intent && selected.length < limit) {
    note = `Only ${selected.length} high-confidence tracks found for ${intent.canonicalArtist}.`;
  }
  return { tracks: selected, note };
}

export async function rankSong(
  input: { title: string; artist: string },
  opts: RankOptions = {},
): Promise<RankResult> {
  ensureDirs();
  const onProgress = opts.onProgress ?? noop;
  const limit = opts.limit ?? 5;

  onProgress({ stage: "understanding-query", message: "Understanding query" });
  const understood = await understandQuerySafe({
    mode: "song",
    input,
    jobId: opts.jobId,
  });
  if (!understood.ok && understood.reason === "rejected") {
    throw new Error(understood.message);
  }
  const intent =
    understood.ok && understood.data.mode === "song" ? understood.data : null;
  const canonicalTitle = intent?.canonicalTitle ?? input.title;
  const canonicalArtist = intent?.canonicalArtist ?? input.artist;

  if (!understood.ok) {
    onProgress({
      stage: "llm-degraded",
      degradeStep: "understand",
      message: understood.message,
    });
  }

  const query = `${canonicalArtist} ${canonicalTitle} official audio`;
  onProgress({
    stage: "scraping-spotify",
    message: `Searching for "${canonicalArtist} - ${canonicalTitle}"`,
  });

  const results = await searchYouTube(query, Math.max(5, limit));
  const valid = results.filter((r) => {
    if (r.duration > MAX_DURATION || r.duration < MIN_DURATION) return false;
    if (isMixOrCompilation(r.title)) return false;
    return true;
  });

  if (valid.length === 0) {
    throw new Error(`No results found for "${canonicalArtist} - ${canonicalTitle}".`);
  }

  const filtered = applyNoiseFilter(
    valid.map((r) => ({
      videoId: r.videoId,
      title: r.title,
      artist: r.channel || canonicalArtist,
      duration: r.duration,
      views: r.views,
      uploadDate: r.uploadDate ?? undefined,
      videoUrl: r.url,
      source: "youtube",
    })),
    "song",
  );
  if (filtered.length === 0) {
    throw new Error(`No non-noise results for "${canonicalArtist} - ${canonicalTitle}".`);
  }
  filtered.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  const tracks: Track[] = filtered.slice(0, limit);

  return { tracks };
}

// ── Download entry points ──

export async function downloadTracks(
  opts: DownloadOptions,
): Promise<{ files: DownloadedTrack[]; failures: Track[] }> {
  ensureDirs();
  const onProgress = opts.onProgress ?? noop;
  const { tracks, playlistName } = opts;

  const files: DownloadedTrack[] = [];
  const failures: Track[] = [];

  for (let i = 0; i < tracks.length; i++) {
    const song = tracks[i];

    // Emit BEFORE the attempt so the UI updates immediately.
    onProgress({
      stage: "downloading",
      current: i + 1,
      total: tracks.length,
      message: `${song.artist} - ${song.title}`,
      track: song,
    });

    let filePath: string | null = null;

    if (song.videoUrl) {
      try {
        filePath = await downloadTrack(song.videoUrl, MUSIC_DIR);
      } catch {
        // Fall through to search-and-download.
      }
    }

    if (!filePath) {
      const result = await searchAndDownload(song.artist, song.title, MUSIC_DIR);
      filePath = result ? result.filePath : null;
    }

    if (filePath) {
      const dt = toDownloadedTrack(filePath, song.title, song.artist, song.duration);
      files.push(dt);
      onProgress({
        stage: "downloading",
        current: i + 1,
        total: tracks.length,
        message: `Downloaded: ${song.artist} - ${song.title}`,
        track: dt,
        status: "ok",
      });
    } else {
      failures.push(song);
      onProgress({
        stage: "downloading",
        current: i + 1,
        total: tracks.length,
        message: `Skipped: ${song.artist} - ${song.title}`,
        track: song,
        status: "failed",
      });
    }
  }

  // Playlist M3U is the last step, only if a name was provided.
  if (playlistName && files.length > 0) {
    generateM3U({
      name: playlistName,
      tracks: files.map((f) => ({
        filePath: f.filePath,
        title: f.title,
        artist: f.artist,
        duration: f.duration,
      })),
    });
  }


  return { files, failures };
}

export async function downloadByUrl(
  url: string,
  name?: string,
  opts: { onProgress?: OnProgress } = {},
): Promise<DownloadedTrack[]> {
  ensureDirs();
  const onProgress = opts.onProgress ?? noop;

  onProgress({
    stage: "downloading",
    current: 0,
    total: 1,
    message: `Downloading from ${url}`,
  });

  const result = await downloadTrack(url, MUSIC_DIR);
  if (!result) {
    throw new Error("No MP3 files were downloaded.");
  }

  // downloadTrack returns a single path today; accept arrays defensively
  // in case upstream ever streams multiple files (e.g. YouTube playlists).
  const filePaths = Array.isArray(result) ? result : [result];
  const files: DownloadedTrack[] = filePaths.map((fp) => {
    const base = basename(fp, extname(fp));
    return toDownloadedTrack(fp, base, "", undefined);
  });

  for (let i = 0; i < files.length; i++) {
    onProgress({
      stage: "downloading",
      current: i + 1,
      total: files.length,
      message: `Downloaded: ${files[i].fileName}`,
      track: files[i],
      status: "ok",
    });
  }

  if (name) {
    generateM3UFromFiles(name, filePaths);
  }


  return files;
}
