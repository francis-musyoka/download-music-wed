import { NextResponse } from "next/server";
import { downloadByUrl, downloadTracks } from "@/lib/pipeline/orchestrator";
import { completeJob, createJob, emit, failJob } from "@/lib/jobs";
import { checkRate, clientIp, releaseSlot, reserveSlot } from "@/lib/limits";
import { getOrSetSession } from "@/lib/session";
import { safeFilename } from "@/lib/sanitize";
import { downloadRequestsTotal, downloadTracksTotal } from "@/lib/metrics";
import { isBearerAuthorized } from "@/lib/auth";
import type { DownloadedTrack, Track } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_URL_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
]);

const MAX_TRACKS = 50;
const MAX_CLIENT_ERROR_LEN = 200;

interface DownloadBody {
    tracks?: Track[];
    url?: string;
    playlistName?: string;
}

function isAllowedUrl(raw: string): boolean {
    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        return false;
    }
    if (u.protocol !== "https:") return false;
    return ALLOWED_URL_HOSTS.has(u.hostname.toLowerCase());
}

function sanitizeClientError(raw: string): string {
    // Strip absolute filesystem paths so the server's directory layout isn't
    // disclosed to the client via SSE `failed` events.
    return raw
        .replace(/\/(?:[^\s:,"'`]+\/)+[^\s:,"'`]*/g, "[path]")
        .slice(0, MAX_CLIENT_ERROR_LEN);
}

export async function POST(req: Request) {
    const ip = clientIp(req);
    if (!isBearerAuthorized(req, "NEXT_PUBLIC_DOWNLOAD_AUTH_TOKEN")) {
        downloadRequestsTotal.inc({ status: "401", reason: "unauthorized", ip });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const retry = checkRate(ip);
    if (retry !== null) {
        downloadRequestsTotal.inc({ status: "429", reason: "rate_limited", ip });
        return NextResponse.json(
            { error: "Too many requests" },
            { status: 429, headers: { "Retry-After": String(retry) } },
        );
    }

    let body: DownloadBody;
    try {
        body = (await req.json()) as DownloadBody;
    } catch {
        downloadRequestsTotal.inc({ status: "400", reason: "invalid_json", ip });
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const hasTracks = Array.isArray(body.tracks) && body.tracks.length > 0;
    const hasUrl = typeof body.url === "string" && body.url.length > 0;

    if (!hasTracks && !hasUrl) {
        downloadRequestsTotal.inc({ status: "400", reason: "missing_input", ip });
        return NextResponse.json(
            { error: "Either tracks or url is required" },
            { status: 400 },
        );
    }

    if (hasTracks && (body.tracks as Track[]).length > MAX_TRACKS) {
        downloadRequestsTotal.inc({ status: "400", reason: "too_many_tracks", ip });
        return NextResponse.json(
            { error: `Too many tracks (max ${MAX_TRACKS})` },
            { status: 400 },
        );
    }

    if (hasUrl && !isAllowedUrl(body.url as string)) {
        downloadRequestsTotal.inc({ status: "400", reason: "bad_url", ip });
        return NextResponse.json(
            { error: "URL not allowed. Only youtube.com / youtu.be over https." },
            { status: 400 },
        );
    }

    if (hasTracks) {
        const tracks = body.tracks as Track[];
        for (let i = 0; i < tracks.length; i++) {
            const u = tracks[i].videoUrl;
            // Tracks without videoUrl are valid — orchestrator falls back to
            // yt-dlp's internal search. We only validate URLs that would be
            // passed to yt-dlp directly.
            if (typeof u === "string" && u.length > 0 && !isAllowedUrl(u)) {
                downloadRequestsTotal.inc({ status: "400", reason: "bad_url", ip });
                return NextResponse.json(
                    {
                        error: `Track ${i} has a videoUrl outside the allowed hosts. Only youtube.com / youtu.be over https.`,
                    },
                    { status: 400 },
                );
            }
        }
    }

    if (!reserveSlot()) {
        downloadRequestsTotal.inc({ status: "429", reason: "busy", ip });
        return NextResponse.json(
            { error: "Server busy, try again shortly" },
            { status: 429 },
        );
    }

    // Past this point any thrown error must either hand the slot off to the job
    // (so `failJob` releases it) or release it directly. Otherwise the slot
    // leaks until process restart and concurrency is permanently reduced.
    let job: ReturnType<typeof createJob> | null = null;
    try {
        const res = NextResponse.json({ jobId: "" });
        const sessionId = getOrSetSession(req, res);
        const playlistName = body.playlistName
            ? safeFilename(body.playlistName)
            : undefined;

        job = createJob({
            kind: "download",
            sessionId,
            mode: hasUrl ? "url" : undefined,
            input: hasUrl ? body.url : undefined,
        });
        const jobId = job.id;

        const onProgress = (ev: Parameters<typeof emit>[1]): void =>
            emit(jobId, ev);

        const runner = async (): Promise<{ files: DownloadedTrack[]; failures: Track[] }> => {
            if (hasUrl) {
                const files = await downloadByUrl(body.url as string, playlistName, { onProgress });
                return { files, failures: [] };
            }
            return downloadTracks({
                tracks: body.tracks as Track[],
                playlistName,
                onProgress,
            });
        };

        runner()
            .then(({ files, failures }) => {
                completeJob(jobId, files);
                if (files.length > 0) {
                    downloadTracksTotal.inc({ ip, outcome: "success" }, files.length);
                }
                if (failures.length > 0) {
                    downloadTracksTotal.inc({ ip, outcome: "failed" }, failures.length);
                }
            })
            .catch((err: unknown) => {
                console.error(`[/api/download] job ${jobId} failed:`, err);
                const raw = err instanceof Error ? err.message : String(err);
                failJob(jobId, sanitizeClientError(raw));
            });

        downloadRequestsTotal.inc({ status: "200", reason: "ok", ip });
        return new NextResponse(JSON.stringify({ jobId }), {
            status: 200,
            headers: res.headers,
        });
    } catch (err) {
        console.error("[/api/download] setup failed:", err);
        if (job) {
            failJob(job.id, "Internal server error");
        } else {
            releaseSlot();
        }
        downloadRequestsTotal.inc({ status: "500", reason: "error", ip });
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
