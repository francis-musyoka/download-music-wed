import { NextResponse } from "next/server";
import {
  rankArtist,
  rankGenre,
  rankSong,
  type RankOptions,
} from "@/lib/pipeline/orchestrator";
import { completeJob, createJob, emit, failJob } from "@/lib/jobs";
import { checkRate, clientIp, releaseSlot, reserveSlot } from "@/lib/limits";
import { getOrSetSession } from "@/lib/session";
import type { Mode, Track } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT_LEN = 200;
const MAX_LIMIT = 50;
const MIN_LIMIT = 1;
const MAX_CLIENT_ERROR_LEN = 200;

function sanitizeClientError(raw: string): string {
  // Strip absolute filesystem paths so the server's directory layout isn't
  // disclosed to the client via SSE `failed` events.
  return raw
    .replace(/\/(?:[^\s:,"'`]+\/)+[^\s:,"'`]*/g, "[path]")
    .slice(0, MAX_CLIENT_ERROR_LEN);
}

interface RankBody {
  mode?: Mode | string;
  input?: string;
  limit?: number;
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const retry = checkRate(ip);
  if (retry !== null) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }

  let body: RankBody;
  try {
    body = (await req.json()) as RankBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { mode, input, limit } = body;

  if (!mode || !input || typeof input !== "string") {
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
    const res = NextResponse.json({ jobId: "" });
    const sessionId = getOrSetSession(req, res);
    job = createJob({ kind: "rank", mode, input, sessionId });
    const jobId = job.id;

    const clampedLimit =
      typeof limit === "number" && Number.isFinite(limit)
        ? Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.floor(limit)))
        : undefined;

    const opts: RankOptions = {
      limit: clampedLimit,
      onProgress: (ev) => emit(jobId, ev),
    };

    const runner = async (): Promise<Track[]> => {
      if (mode === "genre") return rankGenre(input, opts);
      if (mode === "artist") return rankArtist(input, opts);
      return rankSong(input, opts);
    };

    runner()
      .then((tracks) => completeJob(jobId, tracks))
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
