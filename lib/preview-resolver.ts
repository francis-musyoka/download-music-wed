import { execFile } from "node:child_process";

// yt-dlp signed googlevideo URLs are valid for ~6h. We cache for 4h and
// require 30min of remaining life before serving a hit so late consumers
// (slow tabs, network hiccups) still get a playable URL.
function intEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}
const TTL_MS = intEnv("PREVIEW_TTL_MS", 4 * 60 * 60 * 1000);
const SAFETY_MARGIN_MS = intEnv("PREVIEW_SAFETY_MARGIN_MS", 30 * 60 * 1000);
// Default 60s — VPS yt-dlp calls (cookies + EJS challenge solving) routinely
// exceed shorter ceilings on cold cache.
const YT_DLP_TIMEOUT_MS = intEnv("YT_DLP_PREVIEW_TIMEOUT_MS", 60_000);
const MAX_PREVIEW_CACHE = intEnv("PREVIEW_CACHE_MAX_ENTRIES", 500);

// YouTube videoIds are always exactly 11 chars from [A-Za-z0-9_-].
export const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

interface PreviewCacheEntry {
    streamUrl: string;
    expiresAtMs: number;
}

interface ExecFileError extends Error {
    code?: number | string;
    killed?: boolean;
    signal?: NodeJS.Signals | null;
    stderr?: string;
    stdout?: string;
}

// Hoist onto globalThis so the cache survives Next.js dev HMR module
// re-evaluation and is shared across route handlers (preview + stream).
type GlobalWithPreviewCache = typeof globalThis & {
    __downloadMusicPreviewCache?: Map<string, PreviewCacheEntry>;
};
const globalRef = globalThis as GlobalWithPreviewCache;
const PREVIEW_CACHE: Map<string, PreviewCacheEntry> =
    globalRef.__downloadMusicPreviewCache ??
    (globalRef.__downloadMusicPreviewCache = new Map());

function sweepExpired(now: number): void {
    for (const [id, entry] of PREVIEW_CACHE) {
        if (entry.expiresAtMs <= now) {
            PREVIEW_CACHE.delete(id);
        }
    }
}

/**
 * Resolve the direct stream URL via yt-dlp. Uses execFile (NOT exec) so args
 * are passed as an argv list — no shell, no injection surface. Timeout is
 * enforced by Node's child_process and surfaces as `killed: true`.
 */
function spawnYtDlp(videoId: string): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            "yt-dlp",
            [
                "-f",
                // Audio-only formats only — no fallback to `best`. A combined
                // audio+video format from `best` can resolve to a manifest URL
                // that chains additional tracks (especially on YouTube Music Topic
                // channels). 502 is preferable to playing the wrong content.
                "bestaudio[ext=m4a]/bestaudio",
                "-g",
                `https://www.youtube.com/watch?v=${videoId}`,
                "--no-warnings",
                "--no-playlist",
                // Force YouTube's Android-VR API client. yt-dlp's default probes
                // web/web_safari/ios/etc first; those run the slow JS signature
                // solver and burn ~10s before falling through to android_vr which
                // actually works. Pinning it cuts cold resolve from ~15s to ~5s
                // (measured across 4 real-search tracks).
                "--extractor-args",
                "youtube:player_client=android_vr",
            ],
            { timeout: YT_DLP_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
            (err, stdout) => {
                if (err) {
                    reject(err as ExecFileError);
                    return;
                }
                const firstLine = stdout.split(/\r?\n/).find((l) => l.trim().length > 0);
                if (!firstLine) {
                    reject(new Error("yt-dlp returned empty stdout"));
                    return;
                }
                resolve(firstLine.trim());
            },
        );
    });
}

export type ResolvePreviewResult =
    | { ok: true; streamUrl: string; expiresAtMs: number }
    | { ok: false; status: 502 | 504; error: string };

/**
 * Resolve a YouTube videoId to a signed googlevideo URL, with caching.
 * Used by /api/preview (returns URL to client) and /api/stream (proxies bytes).
 * Both endpoints share this module's cache, so a successful preview warms the
 * cache for the subsequent stream request without a second yt-dlp call.
 */
export async function resolvePreview(videoId: string): Promise<ResolvePreviewResult> {
    const now = Date.now();

    const cached = PREVIEW_CACHE.get(videoId);
    if (cached && cached.expiresAtMs - now > SAFETY_MARGIN_MS) {
        return { ok: true, streamUrl: cached.streamUrl, expiresAtMs: cached.expiresAtMs };
    }

    sweepExpired(now);

    let streamUrl: string;
    try {
        streamUrl = await spawnYtDlp(videoId);
    } catch (err) {
        const e = err as ExecFileError;
        if (e.killed && e.signal) {
            return { ok: false, status: 504, error: "Preview resolution timed out" };
        }
        return { ok: false, status: 502, error: "Could not resolve preview" };
    }

    const expiresAtMs = Date.now() + TTL_MS;
    PREVIEW_CACHE.set(videoId, { streamUrl, expiresAtMs });

    while (PREVIEW_CACHE.size > MAX_PREVIEW_CACHE) {
        const oldest = PREVIEW_CACHE.keys().next().value;
        if (oldest === undefined) break;
        PREVIEW_CACHE.delete(oldest);
    }

    return { ok: true, streamUrl, expiresAtMs };
}
