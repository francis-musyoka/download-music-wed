import { PassThrough, Readable } from "node:stream";
import archiver from "archiver";
import { getJob } from "@/lib/jobs";
import { readSession } from "@/lib/session";
import { safeFilename } from "@/lib/sanitize";
import type { DownloadedTrack } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  const job = getJob(jobId);
  if (
    !job ||
    job.kind !== "download" ||
    job.stage !== "complete" ||
    !Array.isArray(job.result) ||
    job.result.length === 0
  ) {
    return new Response("Not found", { status: 404 });
  }

  const session = readSession(req);
  if (!session || session !== job.sessionId) {
    return new Response("Not found", { status: 404 });
  }

  const files = job.result as DownloadedTrack[];

  const archive = archiver("zip", { zlib: { level: 0 } });
  const pass = new PassThrough();

  // Surface archive errors into the stream so the client sees a truncated
  // transfer rather than a hung connection. We don't throw from the route
  // handler because headers have already been sent by the time these fire.
  archive.on("error", (err) => {
    pass.destroy(err);
  });
  archive.on("warning", (err) => {
    // ENOENT warnings are non-fatal for archiver; log and continue.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      pass.destroy(err);
    }
  });

  archive.pipe(pass);

  for (const f of files) {
    archive.file(f.filePath, { name: f.fileName });
  }

  // finalize() resolves when the archive finishes writing to the pipe.
  // Do not await — we want the response to start streaming immediately.
  void archive.finalize();

  const webStream = Readable.toWeb(pass) as ReadableStream<Uint8Array>;
  const filename = safeFilename(`wax-${jobId.slice(0, 8)}`, "wax") + ".zip";

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
