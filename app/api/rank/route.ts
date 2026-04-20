import { NextResponse } from "next/server";
import {
  rankArtist,
  rankGenre,
  rankSong,
  type RankOptions,
} from "@/lib/pipeline/orchestrator";
import { completeJob, createJob, emit, failJob } from "@/lib/jobs";
import { checkRate, clientIp, reserveSlot } from "@/lib/limits";
import { getOrSetSession } from "@/lib/session";
import type { Mode, Track } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT_LEN = 200;

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

  const res = NextResponse.json({ jobId: "" });
  const sessionId = getOrSetSession(req, res);
  const job = createJob({ kind: "rank", mode, input, sessionId });

  const opts: RankOptions = {
    limit: typeof limit === "number" ? limit : undefined,
    onProgress: (ev) => emit(job.id, ev),
  };

  const runner = async (): Promise<Track[]> => {
    if (mode === "genre") return rankGenre(input, opts);
    if (mode === "artist") return rankArtist(input, opts);
    return rankSong(input, opts);
  };

  runner()
    .then((tracks) => completeJob(job.id, tracks))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      failJob(job.id, message);
    });

  return new NextResponse(JSON.stringify({ jobId: job.id }), {
    status: 200,
    headers: res.headers,
  });
}
