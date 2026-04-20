import { NextResponse } from "next/server";
import {
  rankArtist,
  rankGenre,
  rankSong,
  type RankOptions,
} from "@/lib/pipeline/orchestrator";
import { completeJob, createJob, emit, failJob } from "@/lib/jobs";
import type { Mode, Track } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RankBody {
  mode?: Mode | string;
  input?: string;
  limit?: number;
}

export async function POST(req: Request) {
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

  const job = createJob({ kind: "rank", mode, input });

  // Fire-and-forget background task. We intentionally do not await this so the
  // HTTP response returns immediately with the jobId.
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

  return NextResponse.json({ jobId: job.id });
}
