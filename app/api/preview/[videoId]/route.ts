import { execFile } from "node:child_process";
import { NextResponse } from "next/server";
import { checkRate, clientIp } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// yt-dlp signed googlevideo URLs are valid for ~6h. We expose a 4h TTL to the
// client (conservative buffer) and require 30min of remaining life before
// serving a cache hit so late consumers still get a playable URL.
const TTL_MS = 4 * 60 * 60 * 1000;
const SAFETY_MARGIN_MS = 30 * 60 * 1000;
const YT_DLP_TIMEOUT_MS = 15_000;
const MAX_PREVIEW_CACHE = 500;

// YouTube videoIds are always exactly 11 chars from [A-Za-z0-9_-].
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

interface PreviewCacheEntry {
  streamUrl: string;
  expiresAtMs: number;
}

// Hoist onto globalThis so the cache survives Next.js dev HMR module
// re-evaluation and is shared across route invocations. Same pattern as
// lib/jobs.ts.
type GlobalWithPreviewCache = typeof globalThis & {
  __downloadMusicPreviewCache?: Map<string, PreviewCacheEntry>;
};
const globalRef = globalThis as GlobalWithPreviewCache;
const PREVIEW_CACHE: Map<string, PreviewCacheEntry> =
  globalRef.__downloadMusicPreviewCache ??
  (globalRef.__downloadMusicPreviewCache = new Map());

interface ExecFileError extends Error {
  code?: number | string;
  killed?: boolean;
  signal?: NodeJS.Signals | null;
  stderr?: string;
  stdout?: string;
}

interface ResolveResult {
  streamUrl: string;
}

/**
 * Opportunistic sweep of expired cache entries. Keeps the map bounded without
 * a recurring timer — called on every cache miss.
 */
function sweepExpired(now: number): void {
  for (const [id, entry] of PREVIEW_CACHE) {
    if (entry.expiresAtMs <= now) {
      PREVIEW_CACHE.delete(id);
    }
  }
}

/**
 * Resolve the direct stream URL via yt-dlp. Uses execFile (NOT exec) so args
 * are passed as an argv list — no shell, no injection surface. The 15s timeout
 * is enforced by Node's child_process and surfaces as `killed: true`.
 */
function resolveStreamUrl(videoId: string): Promise<ResolveResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      [
        "-f",
        "bestaudio[ext=m4a]/bestaudio/best",
        "-g",
        `https://www.youtube.com/watch?v=${videoId}`,
        "--no-warnings",
        "--no-playlist",
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
        resolve({ streamUrl: firstLine.trim() });
      },
    );
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await params;

  const ip = clientIp(req);
  const retry = checkRate(ip, false);
  if (retry !== null) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }

  if (!VIDEO_ID_RE.test(videoId)) {
    return NextResponse.json(
      { error: "Invalid videoId format" },
      { status: 400 },
    );
  }

  const now = Date.now();

  // Cache hit: only serve if ≥30min of safety margin remaining.
  const cached = PREVIEW_CACHE.get(videoId);
  if (cached && cached.expiresAtMs - now > SAFETY_MARGIN_MS) {
    return NextResponse.json(
      { streamUrl: cached.streamUrl, expiresAtMs: cached.expiresAtMs },
      {
        headers: {
          "Cache-Control": "private, max-age=7200",
        },
      },
    );
  }

  // Miss or near-expiry — sweep then re-resolve.
  sweepExpired(now);

  let result: ResolveResult;
  try {
    result = await resolveStreamUrl(videoId);
  } catch (err) {
    const e = err as ExecFileError;
    // Node sets killed=true when a timeout kills the child. Surface as 504.
    if (e.killed && e.signal) {
      return NextResponse.json(
        { error: "Preview resolution timed out" },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: "Could not resolve preview" },
      { status: 502 },
    );
  }

  const expiresAtMs = Date.now() + TTL_MS;
  PREVIEW_CACHE.set(videoId, { streamUrl: result.streamUrl, expiresAtMs });

  while (PREVIEW_CACHE.size > MAX_PREVIEW_CACHE) {
    const oldest = PREVIEW_CACHE.keys().next().value;
    if (oldest === undefined) break;
    PREVIEW_CACHE.delete(oldest);
  }

  return NextResponse.json(
    { streamUrl: result.streamUrl, expiresAtMs },
    {
      headers: {
        "Cache-Control": "private, max-age=7200",
      },
    },
  );
}
