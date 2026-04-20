import { NextResponse } from "next/server";
import { downloadByUrl, downloadTracks } from "@/lib/pipeline/orchestrator";
import { completeJob, createJob, emit, failJob } from "@/lib/jobs";
import type { DownloadedTrack, Track } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DownloadBody {
  tracks?: Track[];
  url?: string;
  playlistName?: string;
}

export async function POST(req: Request) {
  let body: DownloadBody;
  try {
    body = (await req.json()) as DownloadBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hasTracks = Array.isArray(body.tracks) && body.tracks.length > 0;
  const hasUrl = typeof body.url === "string" && body.url.length > 0;

  if (!hasTracks && !hasUrl) {
    return NextResponse.json(
      { error: "Either tracks or url is required" },
      { status: 400 },
    );
  }

  const job = createJob({
    kind: "download",
    mode: hasUrl ? "url" : undefined,
    input: hasUrl ? body.url : undefined,
  });

  const onProgress = (ev: Parameters<typeof emit>[1]): void =>
    emit(job.id, ev);

  const runner = async (): Promise<DownloadedTrack[]> => {
    if (hasUrl) {
      return downloadByUrl(body.url as string, body.playlistName, {
        onProgress,
      });
    }
    const { files } = await downloadTracks({
      tracks: body.tracks as Track[],
      playlistName: body.playlistName,
      onProgress,
    });
    return files;
  };

  runner()
    .then((files) => completeJob(job.id, files))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      failJob(job.id, message);
    });

  return NextResponse.json({ jobId: job.id });
}
