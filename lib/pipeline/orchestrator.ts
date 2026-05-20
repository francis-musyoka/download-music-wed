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
import { createSpotifyClient, spotifyAvailable } from "@/lib/spotify/client";
import type { SpotifyTrack } from "@/lib/spotify/schemas";
import { pickBestMatch, type YtCandidate } from "@/lib/pipeline/match/youtubeMatch";
import { normalizeQueryKey, getSeen, markSeen } from "@/lib/spotify/seenTracks";

const MIN_RESULTS = Number(process.env.SPOTIFY_MIN_RESULTS ?? 3);

// ── CommonJS pipeline modules (ported from the CLI, byte-for-byte) ──
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ytMusicMod = require("./scrapers/youtube-music") as {
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

const { collectCandidates, collectArtistCandidates } = ytMusicMod;
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

async function rankGenreYouTube(
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
            // Mark on the in-memory job so the route handler can increment the expensive quota.
            if (opts.jobId) {
                // require lazily to avoid a circular import between orchestrator and jobs
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { getJob } = require("../jobs") as typeof import("../jobs");
                const j = getJob(opts.jobId);
                if (j) j.expensiveLLMFired = true;
            }
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

async function rankArtistYouTube(
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
        onProgress({
            stage: "scraping-spotify",
            message: "First crate came up empty — widening the search",
        });
        candidates = await searchArtistFallback(
            effectiveArtist,
            Math.max(20, limit * 4),
        );
    }
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
            // Mark on the in-memory job so the route handler can increment the expensive quota.
            if (opts.jobId) {
                // require lazily to avoid a circular import between orchestrator and jobs
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const { getJob } = require("../jobs") as typeof import("../jobs");
                const j = getJob(opts.jobId);
                if (j) j.expensiveLLMFired = true;
            }
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

async function rankSongYouTube(
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

// ── Spotify-path helpers (shared by rankSong/Artist/Genre Spotify variants) ──

function getJobSessionId(jobId: string): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getJob } = require("../jobs") as typeof import("../jobs");
    return getJob(jobId)?.sessionId ?? "anonymous";
}

function spotifyToTrack(sp: SpotifyTrack, yt: YtCandidate): Track {
    return {
        title: sp.name,
        artist: sp.artists[0]?.name ?? "Unknown",
        duration: yt.durationSec,
        videoId: yt.videoId,
        videoUrl: `https://www.youtube.com/watch?v=${yt.videoId}`,
        channel: yt.channel,
        source: "spotify",
        spotifyId: sp.id,
        popularity: sp.popularity,
        isrc: sp.external_ids?.isrc,
        releaseDate: sp.album?.release_date,
    };
}

async function findMatchingYouTube(sp: SpotifyTrack): Promise<YtCandidate | null> {
    const artist = sp.artists[0]?.name ?? "";
    const query = `${artist} ${sp.name}`;
    const yt = await searchYouTube(query, 5);
    const candidates: YtCandidate[] = yt.map((r) => ({
        videoId: r.videoId,
        title: r.title,
        channel: r.channel,
        durationSec: r.duration,
    }));
    return pickBestMatch(
        { id: sp.id, name: sp.name, artist, durationMs: sp.duration_ms },
        candidates,
    );
}

async function spotifyTracksToTracks(
    selected: SpotifyTrack[],
    onProgress: OnProgress,
): Promise<Track[]> {
    onProgress({
        stage: "spotify-matching",
        message: `Matching ${selected.length} tracks to YouTube`,
    });
    const out: Track[] = [];
    for (const sp of selected) {
        const yt = await findMatchingYouTube(sp);
        if (!yt) continue;
        out.push(spotifyToTrack(sp, yt));
    }
    return out;
}

export async function rankSongSpotify(
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

    onProgress({
        stage: "spotify-querying",
        message: `Searching Spotify for "${canonicalArtist} - ${canonicalTitle}"`,
    });

    const client = createSpotifyClient();
    const q = `track:"${canonicalTitle}" artist:"${canonicalArtist}"`;
    let matches: SpotifyTrack[];
    try {
        matches = await client.searchTracks(q, { limit: Math.max(5, limit) });
    } catch {
        onProgress({
            stage: "spotify-fallback-triggered",
            message: "Spotify search failed; falling back to YouTube",
        });
        return rankSongYouTube({ title: canonicalTitle, artist: canonicalArtist }, opts);
    }

    if (matches.length === 0) {
        onProgress({
            stage: "spotify-fallback-triggered",
            message: "No Spotify match; falling back to YouTube",
        });
        return rankSongYouTube({ title: canonicalTitle, artist: canonicalArtist }, opts);
    }

    matches.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    const selected = matches.slice(0, limit);
    const tracks = await spotifyTracksToTracks(selected, onProgress);

    if (tracks.length < MIN_RESULTS) {
        onProgress({
            stage: "spotify-fallback-triggered",
            message: "Thin Spotify match; falling back to YouTube",
        });
        return rankSongYouTube({ title: canonicalTitle, artist: canonicalArtist }, opts);
    }

    return { tracks };
}

export async function rankArtistSpotify(
    artist: string,
    opts: RankOptions = {},
): Promise<RankResult> {
    ensureDirs();
    const onProgress = opts.onProgress ?? noop;
    const limit = opts.limit ?? 5;
    const sessionId = opts.jobId ? getJobSessionId(opts.jobId) : "anonymous";

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
        understood.ok && understood.data.mode === "artist"
            ? understood.data
            : null;
    const canonicalArtist = intent?.canonicalArtist ?? artist;

    onProgress({
        stage: "spotify-querying",
        message: `Searching Spotify for "${canonicalArtist}"`,
    });
    const client = createSpotifyClient();

    let artistEntity: { id: string; name: string } | null;
    try {
        artistEntity = await client.searchArtist(canonicalArtist);
    } catch {
        onProgress({
            stage: "spotify-fallback-triggered",
            message: "Spotify search failed; falling back",
        });
        return rankArtistYouTube(canonicalArtist, opts);
    }
    if (!artistEntity) {
        onProgress({
            stage: "spotify-fallback-triggered",
            message: "Artist not on Spotify; falling back",
        });
        return rankArtistYouTube(canonicalArtist, opts);
    }

    const queryKey = normalizeQueryKey("artist", canonicalArtist);
    const seen = getSeen(sessionId, queryKey);

    let pool: SpotifyTrack[];
    try {
        pool = await client.getArtistTopTracks(artistEntity.id);
    } catch {
        onProgress({
            stage: "spotify-fallback-triggered",
            message: "Spotify error; falling back",
        });
        return rankArtistYouTube(canonicalArtist, opts);
    }

    let unseen = pool.filter((t) => !seen.has(t.id));

    if (unseen.length < limit) {
        // Walk albums for more candidates.
        try {
            const albums = await client.getArtistAlbums(artistEntity.id, {
                limit: 20,
            });
            const albumTracks: SpotifyTrack[] = [];
            for (const alb of albums) {
                if (albumTracks.length + unseen.length >= limit + 10) break;
                const t = await client.getAlbumTracks(alb.id);
                albumTracks.push(...t);
            }
            pool = pool.concat(albumTracks);
            // dedupe pool by id
            const byId = new Map<string, SpotifyTrack>();
            for (const t of pool) if (!byId.has(t.id)) byId.set(t.id, t);
            pool = Array.from(byId.values());
            unseen = pool.filter((t) => !seen.has(t.id));
        } catch {
            // album walk failure: continue with what we have
        }
    }

    if (unseen.length < MIN_RESULTS) {
        onProgress({
            stage: "spotify-fallback-triggered",
            message: "Spotify pool too thin; falling back",
        });
        return rankArtistYouTube(canonicalArtist, opts);
    }

    unseen.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    const selected = unseen.slice(0, limit);
    const tracks = await spotifyTracksToTracks(selected, onProgress);

    if (tracks.length < MIN_RESULTS) {
        onProgress({
            stage: "spotify-fallback-triggered",
            message: "Could not match enough tracks; falling back",
        });
        return rankArtistYouTube(canonicalArtist, opts);
    }

    // mark only successfully-matched Spotify tracks
    const matchedIds = tracks
        .map((t) => t.spotifyId)
        .filter((id): id is string => !!id);
    markSeen(sessionId, queryKey, matchedIds);

    let note: string | undefined;
    if (tracks.length < limit) {
        note = `Only ${tracks.length} high-confidence tracks found for ${canonicalArtist}.`;
    }
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

// ── Public routers — pick Spotify path when available, else YouTube path. ──
// The full Spotify implementations are added in Tasks 17–19. For now they
// just delegate to the YT functions so the orchestrator still typechecks.

export async function rankGenre(
    genre: string,
    opts: RankOptions = {},
): Promise<RankResult> {
    return rankGenreYouTube(genre, opts);
}
export async function rankArtist(
    artist: string,
    opts: RankOptions = {},
): Promise<RankResult> {
    if (spotifyAvailable()) return rankArtistSpotify(artist, opts);
    return rankArtistYouTube(artist, opts);
}
export async function rankSong(
    input: { title: string; artist: string },
    opts: RankOptions = {},
): Promise<RankResult> {
    if (spotifyAvailable()) return rankSongSpotify(input, opts);
    return rankSongYouTube(input, opts);
}
