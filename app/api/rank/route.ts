import { NextResponse } from "next/server";
import {
    rankArtist,
    rankGenre,
    rankSong,
    type RankOptions,
} from "@/lib/pipeline/orchestrator";
import { completeJob, createJob, emit, failJob } from "@/lib/jobs";
import {
    checkRate,
    clientIp,
    consumeDailyExpensive,
    consumeDailyOverall,
    peekDailyExpensive,
    releaseSlot,
    reserveSlot,
} from "@/lib/limits";
import { getOrSetSession } from "@/lib/session";
import type { Mode, Track } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT_LEN = 200;
const MAX_LIMIT = 10;
const MIN_LIMIT = 1;
const MAX_CLIENT_ERROR_LEN = 200;

function sanitizeClientError(raw: string): string {
    return raw
        .replace(/\/(?:[^\s:,"'`]+\/)+[^\s:,"'`]*/g, "[path]")
        .slice(0, MAX_CLIENT_ERROR_LEN);
}

interface RankBody {
    mode?: Mode | string;
    input?: string | { title?: unknown; artist?: unknown };
    limit?: number;
}

function validateSongInput(raw: unknown): { title: string; artist: string } | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as { title?: unknown; artist?: unknown };
    if (typeof r.title !== "string" || typeof r.artist !== "string") return null;
    const title = r.title.trim();
    const artist = r.artist.trim();
    if (!title || !artist) return null;
    if (title.length > MAX_INPUT_LEN || artist.length > MAX_INPUT_LEN) return null;
    return { title, artist };
}

export async function POST(req: Request) {
    const ip = clientIp(req);
    const res = NextResponse.json({ jobId: "" });
    const sessionId = getOrSetSession(req, res);

    let body: RankBody;
    try {
        body = (await req.json()) as RankBody;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { mode, input, limit } = body;

    // ── Validation FIRST — never charge rate limits for invalid requests. ──

    if (!mode) {
        return NextResponse.json(
            { error: "mode and input required" },
            { status: 400 },
        );
    }

    if (mode === "url") {
        return NextResponse.json(
            { error: "URL mode uses /api/download" },
            { status: 400 },
        );
    }

    if (mode !== "genre" && mode !== "artist" && mode !== "song") {
        return NextResponse.json(
            { error: "mode and input required" },
            { status: 400 },
        );
    }

    let songInput: { title: string; artist: string } | null = null;
    let stringInput: string | null = null;

    if (mode === "song") {
        songInput = validateSongInput(input);
        if (!songInput) {
            return NextResponse.json(
                { error: "song mode requires { title, artist } with both non-empty" },
                { status: 400 },
            );
        }
    } else {
        if (!input || typeof input !== "string") {
            return NextResponse.json(
                { error: "mode and input required" },
                { status: 400 },
            );
        }
        if (input.length > MAX_INPUT_LEN) {
            return NextResponse.json(
                { error: "input too long" },
                { status: 400 },
            );
        }
        stringInput = input;
    }

    // ── Rate limits — only charged for fully validated requests. ──

    // Helper: preserve the Set-Cookie added by getOrSetSession when returning
    // an early 429. Without this, first-time users who hit the rate limit on
    // their very first request never receive a session cookie.
    const errorResponse = (status: number, errorBody: object, retryAfter: number) => {
        const headers = new Headers(res.headers);
        headers.set("Retry-After", String(retryAfter));
        headers.set("Content-Type", "application/json");
        return new NextResponse(JSON.stringify(errorBody), { status, headers });
    };

    const retry = checkRate(ip);
    if (retry !== null) {
        return errorResponse(429, { error: "Too many requests" }, retry);
    }

    // Genre mode is the only request type that can fire the expensive LLM
    // rerank — peek (read-only) so a blocked genre request doesn't burn the
    // user's overall quota below. The deferred increment happens via
    // `onExpensiveFired` from the orchestrator after a successful rerank.
    if (mode === "genre") {
        const expRetry = peekDailyExpensive(sessionId);
        if (expRetry !== null) {
            return errorResponse(
                429,
                {
                    error:
                        "Daily genre search limit reached. Try artist, song, or URL mode.",
                    retryAfter: expRetry,
                },
                expRetry,
            );
        }
    }

    // Every genre / artist / song call burns one overall slot.
    const dayRetry = consumeDailyOverall(sessionId);
    if (dayRetry !== null) {
        return errorResponse(
            429,
            {
                error: "Daily search limit reached. Try again tomorrow.",
                retryAfter: dayRetry,
            },
            dayRetry,
        );
    }

    if (!reserveSlot()) {
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
        const jobInputStr =
            songInput !== null
                ? `${songInput.title} — ${songInput.artist}`
                : stringInput!;
        job = createJob({ kind: "rank", mode, input: jobInputStr, sessionId });
        const jobId = job.id;

        const clampedLimit =
            typeof limit === "number" && Number.isFinite(limit)
                ? Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(limit)))
                : undefined;

        const opts: RankOptions = {
            limit: clampedLimit,
            onProgress: (ev) => emit(jobId, ev),
            jobId,
            // Deferred increment of the per-session expensive-tier daily quota
            // — fires only when rankGenre's `rerankCandidatesSafe` returns ok.
            onExpensiveFired: () => consumeDailyExpensive(sessionId),
        };

        const runner = async (): Promise<{ tracks: Track[]; note?: string }> => {
            if (mode === "genre") return rankGenre(stringInput!, opts);
            if (mode === "artist") return rankArtist(stringInput!, opts);
            return rankSong(songInput!, opts);
        };

        runner()
            .then(({ tracks, note }) => completeJob(jobId, tracks, { note }))
            .catch((err: unknown) => {
                console.error(`[/api/rank] job ${jobId} failed:`, err);
                const raw = err instanceof Error ? err.message : String(err);
                failJob(jobId, sanitizeClientError(raw));
            });

        return new NextResponse(JSON.stringify({ jobId }), {
            status: 200,
            headers: res.headers,
        });
    } catch (err) {
        console.error("[/api/rank] setup failed:", err);
        if (job) {
            failJob(job.id, "Internal server error");
        } else {
            releaseSlot();
        }
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
