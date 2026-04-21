import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MUSIC_DIR } = require("@/lib/pipeline/config/constants") as {
  MUSIC_DIR: string;
};

const MUSIC_DIR_RESOLVED = path.resolve(MUSIC_DIR);

// bytes=START-END  (END optional). Reject anything else.
const RANGE_RE = /^bytes=(\d+)-(\d*)$/;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;

  // Path-traversal guard: strip directory components from the input, then
  // verify the joined path stays within the music directory.
  let decoded: string;
  try {
    decoded = decodeURIComponent(file);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const safeName = path.basename(decoded);
  if (!safeName || safeName === "." || safeName === "..") {
    return new Response("Forbidden", { status: 403 });
  }

  const fullPath = path.join(MUSIC_DIR_RESOLVED, safeName);
  if (path.dirname(fullPath) !== MUSIC_DIR_RESOLVED) {
    return new Response("Forbidden", { status: 403 });
  }

  let size: number;
  try {
    const st = await stat(fullPath);
    if (!st.isFile()) {
      return new Response("Not found", { status: 404 });
    }
    size = st.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const baseHeaders: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  };

  const rangeHeader = req.headers.get("range");

  if (rangeHeader) {
    const match = RANGE_RE.exec(rangeHeader.trim());
    if (!match) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    const start = Number(match[1]);
    const end = match[2] === "" ? size - 1 : Number(match[2]);

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      end >= size
    ) {
      return new Response("Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }

    const chunkSize = end - start + 1;
    const nodeStream = createReadStream(fullPath, { start, end });
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(chunkSize),
      },
    });
  }

  const nodeStream = createReadStream(fullPath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    status: 200,
    headers: {
      ...baseHeaders,
      "Content-Length": String(size),
    },
  });
}
