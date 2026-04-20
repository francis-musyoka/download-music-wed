import { NextResponse } from "next/server";
import { downloadByUrl, downloadTracks } from "@/lib/pipeline/orchestrator";
import { completeJob, createJob, emit, failJob } from "@/lib/jobs";
import { checkRate, clientIp, reserveSlot } from "@/lib/limits";
import { getOrSetSession } from "@/lib/session";
import { safeFilename } from "@/lib/sanitize";
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

export async function POST(req: Request) {
  const ip = clientIp(req);
  const retry = checkRate(ip);
  if (retry !== null) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retry) } },
    );
  }

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

  if (hasUrl && !isAllowedUrl(body.url as string)) {
    return NextResponse.json(
      { error: "URL not allowed. Only youtube.com / youtu.be over https." },
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
  const playlistName = body.playlistName
    ? safeFilename(body.playlistName)
    : undefined;

  const job = createJob({
    kind: "download",
    sessionId,
    mode: hasUrl ? "url" : undefined,
    input: hasUrl ? body.url : undefined,
  });

  const onProgress = (ev: Parameters<typeof emit>[1]): void =>
    emit(job.id, ev);

  const runner = async (): Promise<DownloadedTrack[]> => {
    if (hasUrl) {
      return downloadByUrl(body.url as string, playlistName, { onProgress });
    }
    const { files } = await downloadTracks({
      tracks: body.tracks as Track[],
      playlistName,
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

  return new NextResponse(JSON.stringify({ jobId: job.id }), {
    status: 200,
    headers: res.headers,
  });
}
