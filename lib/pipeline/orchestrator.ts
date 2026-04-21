import { basename, extname } from "node:path";
import { statSync } from "node:fs";
import type { DownloadedTrack, ProgressEvent, Track } from "../types";
import { ensureDirs } from "./deps";

// ── CommonJS pipeline modules (ported from the CLI, byte-for-byte) ──
// eslint-disable-next-line @typescript-eslint/no-require-imports
const spotifyMod = require("./scrapers/spotify") as {
  collectCandidates: (genre: string) => Promise<Track[]>;
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
}

export interface DownloadOptions {
  tracks: Track[];
  playlistName?: string;
  onProgress?: OnProgress;
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
    message: `Enriching ${needsEnrichment.length} candidates with YouTube data`,
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
): Promise<Track[]> {
  ensureDirs();
  const onProgress = opts.onProgress ?? noop;
  const limit = opts.limit ?? DEFAULT_LIMIT;

  onProgress({
    stage: "scraping-spotify",
    message: `Collecting candidates for "${genre}"`,
  });

  let candidates = await collectCandidates(genre);

  if (candidates.length === 0) {
    onProgress({
      stage: "scraping-spotify",
      message: "Spotify returned zero candidates — falling back to YouTube",
    });
    candidates = await scrapeYTMusicFallback(genre, limit * 3);
  }

  if (candidates.length === 0) {
    throw new Error(`No songs found for genre "${genre}".`);
  }

  await enrichCandidates(candidates, onProgress);
  candidates = dedupeAgainstLibrary(candidates);

  if (candidates.length === 0) {
    return [];
  }

  onProgress({ stage: "scoring", message: "Scoring and ranking candidates" });
  const ranked = rankCandidates(candidates);
  const diverse = applyDiversityCap(ranked);
  const selected = diverse.slice(0, limit);

  return selected;
}

export async function rankArtist(
  artist: string,
  opts: RankOptions = {},
): Promise<Track[]> {
  ensureDirs();
  const onProgress = opts.onProgress ?? noop;
  const limit = opts.limit ?? 5;

  onProgress({
    stage: "scraping-spotify",
    message: `Collecting top songs for "${artist}"`,
  });

  let candidates = await collectArtistCandidates(artist);
  if (candidates.length === 0) {
    throw new Error(`No songs found for artist "${artist}".`);
  }

  candidates = dedupeAgainstLibrary(candidates);
  if (candidates.length === 0) {
    return [];
  }

  onProgress({ stage: "scoring", message: "Scoring and ranking" });
  // No diversity cap for single-artist flows (matches CLI).
  const ranked = rankCandidates(candidates);
  const selected = ranked.slice(0, limit);

  return selected;
}

export async function rankSong(
  query: string,
  opts: RankOptions = {},
): Promise<Track[]> {
  ensureDirs();
  const onProgress = opts.onProgress ?? noop;
  const limit = opts.limit ?? 5;

  onProgress({
    stage: "scraping-spotify",
    message: `Searching for "${query}"`,
  });

  const results = await searchYouTube(query, Math.max(5, limit));
  const valid = results.filter((r) => {
    if (r.duration > MAX_DURATION || r.duration < MIN_DURATION) return false;
    if (isMixOrCompilation(r.title)) return false;
    return true;
  });

  if (valid.length === 0) {
    throw new Error(`No results found for "${query}".`);
  }

  // Sort by views (most popular match first) — matches CLI runSong().
  valid.sort((a, b) => b.views - a.views);

  const tracks: Track[] = valid.slice(0, limit).map((r) => ({
    videoId: r.videoId,
    title: r.title,
    artist: r.channel || "Unknown",
    duration: r.duration,
    views: r.views,
    uploadDate: r.uploadDate ?? undefined,
    videoUrl: r.url,
    source: "youtube",
  }));

  return tracks;
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
