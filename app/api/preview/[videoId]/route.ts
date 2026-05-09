import { NextResponse } from "next/server";
import { checkRate, clientIp } from "@/lib/limits";
import { resolvePreview, VIDEO_ID_RE } from "@/lib/preview-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const result = await resolvePreview(videoId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    { streamUrl: result.streamUrl, expiresAtMs: result.expiresAtMs },
    {
      headers: {
        "Cache-Control": "private, max-age=7200",
      },
    },
  );
}
