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
import { findBestTitleMatch } from "./utils/title-match.ts";

// ── CommonJS pipeline modules (ported from the CLI, byte-for-byte) ──
// eslint-disable-next-line @typescript-eslint/no-require-imports
const log = require("./utils/logger");
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
const ytmusicApiMod = require("./scrapers/ytmusic-api") as {
        searchSongs: (query: string, limit: number, opts?: { tags?: { inNewPool?: boolean } }) => Promise<Track[]>;
        searchSongsParallel: (
                queryDefs: Array<{ query: string; tags?: { inNewPool?: boolean } }>,
                limit: number,
        ) => Promise<Track[]>;
};
const { searchSongs, searchSongsParallel } = ytmusicApiMod;
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

function logRankComplete(payload: {
    mode: "genre" | "artist" | "song";
    query: string;
    raw: number;
    afterNoise: number;
    toLlm?: number;
    afterRerank?: number;
    afterDiversity?: number;
    final: number;
    searchMs: number;
    rerankMs?: number;
    totalMs: number;
}): void {
    log.info(payload, "rank-complete");
}

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

/**
 * yt-dlp fallback for artist mode when the Playwright YT-Music scrape returns
 * zero candidates (typical on datacenter IPs that hit Google's EU consent wall).
 * Loose channel-name match mirrors collectArtistCandidates in scrapers/spotify.js.
 */
async function searchArtistFallback(
        artist: string,
        count: number,
): Promise<Track[]> {
        const queries = [
                `${artist} best songs`,
                `${artist} top hits`,
                `${artist} popular songs`,
        ];
        const artistLower = artist.toLowerCase();
        const seen = new Map<string, Track>();

        for (const query of queries) {
                let results: YtSearchResult[];
                try {
                        results = await searchYouTube(query, count);
                } catch {
                        continue;
                }
                for (const r of results) {
                        if (r.duration > MAX_DURATION) continue;
                        if (r.duration > 0 && r.duration < MIN_DURATION) continue;
                        if (isMixOrCompilation(r.title)) continue;

                        const channelLower = (r.channel || "").toLowerCase();
                        const matches =
                                channelLower.includes(artistLower) ||
                                (channelLower !== "" && artistLower.includes(channelLower));
                        if (!matches) continue;

                        if (seen.has(r.videoId)) continue;
                        seen.set(r.videoId, {
                                videoId: r.videoId,
                                title: r.title,
                                artist: r.channel || artist,
                                channel: r.channel,
                                duration: r.duration,
                                views: r.views,
                                uploadDate: r.uploadDate ?? undefined,
                                videoUrl: r.url,
                                playlistCount: 1,
                                bestPosition: 50,
                                source: "youtube",
                        });
                }
        }

        return Array.from(seen.values());
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
        const t0 = Date.now();
        let raw = 0, afterNoise = 0, toLlm = 0, afterRerank = 0, afterDiversity = 0;
        let searchMs = 0, rerankMs = 0;

        // ── Scrape (3× parallel) ──
        onProgress({
                stage: "scraping-spotify",
                message: `Searching YT Music for "${genre}"`,
        });
        let candidates = await searchSongsParallel(
                [
                        { query: genre, tags: { inNewPool: false } },
                        { query: `${genre} hits`, tags: { inNewPool: false } },
                        { query: `${genre} new`, tags: { inNewPool: true } },
                ],
                200,
        );
        searchMs = Date.now() - t0;
        raw = candidates.length;

        if (candidates.length === 0) {
                throw new Error(`No songs found for genre "${genre}".`);
        }

        // ── Noise filter + library dedupe ──
        candidates = applyNoiseFilter(candidates, "genre");
        candidates = dedupeAgainstLibrary(candidates);
        afterNoise = candidates.length;
        if (candidates.length === 0) {
                return { tracks: [] };
        }

        // ── Hit-score ranking ──
        onProgress({ stage: "scoring", message: "Ranking candidates" });
        const ranked = rankCandidates(candidates);

        // ── LLM rerank on top 50 ──
        const LLM_INPUT_CAP = 50;
        const llmInput = ranked.slice(0, LLM_INPUT_CAP);
        toLlm = llmInput.length;

        onProgress({
                stage: "llm-reranking",
                message: `Classifying ${llmInput.length} candidates`,
        });

        // Minimal intent stub — understandQuery was removed; rerankCandidatesSafe
        // still expects this shape for its prompt assembly.
        const fakeIntent = {
                mode: "genre" as const,
                canonicalGenre: genre,
                displayName: genre,
                knownGenre: true,
                spellCorrected: false,
                originalInput: genre,
                searchTerms: [],
        };

        const result = await rerankCandidatesSafe({
                mode: "genre",
                intent: fakeIntent,
                candidates: llmInput.map<RerankCandidate>((c) => ({
                        id: c.videoId ? `v:${c.videoId}` : `c:${c.artist}__${c.title}`,
                        title: c.title,
                        artist: c.artist,
                })),
                jobId: opts.jobId,
        });

        let kept: Track[];
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
                // Degrade: take top 10 of the 50 by hit-score
                kept = llmInput;
        }

        rerankMs = Date.now() - t0 - searchMs;
        afterRerank = kept.length;

        // ── Diversity cap + slice ──
        const diverse = applyDiversityCap(kept);
        afterDiversity = diverse.length;
        const selected = diverse.slice(0, limit);
        let note: string | undefined;
        if (selected.length < limit) {
                note = `Only ${selected.length} high-confidence tracks found — try a broader query or lower the count.`;
        }
        logRankComplete({
                mode: "genre", query: genre,
                raw, afterNoise, toLlm, afterRerank, afterDiversity, final: selected.length,
                searchMs, rerankMs, totalMs: Date.now() - t0,
        });
        return { tracks: selected, note };
}

export async function rankArtist(
    artist: string,
    opts: RankOptions = {},
): Promise<RankResult> {
    ensureDirs();
    const onProgress = opts.onProgress ?? noop;
    const limit = opts.limit ?? 10;
    const t0 = Date.now();
    let searchMs = 0;

    onProgress({
        stage: "scraping-spotify",
        message: `Searching YT Music for "${artist}"`,
    });
    const raw = await searchSongs(artist, 200);
    searchMs = Date.now() - t0;
    if (raw.length === 0) {
        throw new Error(`No songs found for artist "${artist}".`);
    }

    // Wide artist match — keep if normalize(artist) appears in any of
    // candidate.artists[]. Features count as the artist's tracks too.
    const aLow = artist.toLowerCase().trim();
    type WithArtists = Track & { artists?: string[] };
    const matched = (raw as WithArtists[]).filter((t) => {
        const list = t.artists ?? [t.artist];
        return list.some((a) => {
            const x = (a || "").toLowerCase().trim();
            return x && (x === aLow || x.includes(aLow) || aLow.includes(x));
        });
    });

    let candidates: Track[] = applyNoiseFilter(matched, "artist");
    candidates = dedupeAgainstLibrary(candidates);
    if (candidates.length === 0) return { tracks: [] };

    onProgress({ stage: "scoring", message: "Ranking" });
    const ranked = rankCandidates(candidates);
    const selected = ranked.slice(0, limit);
    let note: string | undefined;
    if (selected.length < limit) {
        note = `Only ${selected.length} tracks found for ${artist}.`;
    }
    logRankComplete({
        mode: "artist", query: artist,
        raw: raw.length,
        afterNoise: candidates.length,
        final: selected.length,
        searchMs, totalMs: Date.now() - t0,
    });
    return { tracks: selected, note };
}

export async function rankSong(
    input: { title: string; artist: string },
    opts: RankOptions = {},
): Promise<RankResult> {
    ensureDirs();
    const onProgress = opts.onProgress ?? noop;
    const limit = opts.limit ?? 5;
    const t0 = Date.now();
    let searchMs = 0;

    onProgress({
        stage: "scraping-spotify",
        message: `Searching for "${input.artist} - ${input.title}"`,
    });

    // Two parallel calls:
    //   A — exact "artist title" search → look for title-match pin
    //   B — artist-only search → fill 4 more by hit-score
    const [callA, callB] = await Promise.all([
        searchSongs(`${input.artist} ${input.title}`, 20),
        searchSongs(input.artist, 20),
    ]);
    searchMs = Date.now() - t0;

    // Pin candidate from A
    const pinned = findBestTitleMatch(
        callA as (Track & { artists?: string[] })[],
        input.artist,
        input.title,
    );

    // Fill from B (wide artist match, noise filter, hit-score, exclude pinned)
    const aLow = input.artist.toLowerCase().trim();
    type WithArtists = Track & { artists?: string[] };
    const matchedB = (callB as WithArtists[]).filter((t) => {
        const list = t.artists ?? [t.artist];
        return list.some((a) => {
            const x = (a || "").toLowerCase().trim();
            return x && (x === aLow || x.includes(aLow) || aLow.includes(x));
        });
    });
    const cleanedB = applyNoiseFilter(matchedB, "song");
    const rankedB = rankCandidates(cleanedB);
    const pinId = pinned?.videoId;
    const fillers = rankedB.filter((t) => t.videoId !== pinId).slice(0, limit - (pinned ? 1 : 0));

    const tracks: Track[] = pinned ? [pinned, ...fillers] : rankedB.slice(0, limit);
    let note: string | undefined;
    if (!pinned) {
        note = `Exact track not found; here are top tracks by ${input.artist}.`;
    }
    if (tracks.length === 0) {
        throw new Error(`No results found for "${input.artist} - ${input.title}".`);
    }

    logRankComplete({
        mode: "song", query: `${input.artist} - ${input.title}`,
        raw: callA.length + callB.length,
        afterNoise: tracks.length,
        final: tracks.length,
        searchMs, totalMs: Date.now() - t0,
    });
    return { tracks, note };
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
                        } catch (err) {
                                log.warn(`Download failed for ${song.artist} - ${song.title}: ${(err as Error).message}`);
                        }
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
