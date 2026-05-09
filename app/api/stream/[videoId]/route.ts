import { resolvePreview, VIDEO_ID_RE } from "@/lib/preview-resolver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Headers we forward from the client to googlevideo. Range/If-Range are the
// important ones — without them, audio scrubbing stops working.
const FORWARDED_REQUEST_HEADERS = ["range", "if-range"];

// Headers we forward from googlevideo back to the client. We deliberately do
// NOT forward Cache-Control, Set-Cookie, or googlevideo's CORS headers — those
// are what trigger Chrome's ORB. The whole point of this route is that the
// browser sees a clean same-origin response.
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "last-modified",
  "etag",
];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await params;

  if (!VIDEO_ID_RE.test(videoId)) {
    return new Response("Invalid videoId format", { status: 400 });
  }

  // Resolve to googlevideo URL (cache hit if /api/preview was just called).
  const resolved = await resolvePreview(videoId);
  if (!resolved.ok) {
    return new Response(resolved.error, { status: resolved.status });
  }

  const upstreamHeaders: Record<string, string> = {};
  for (const h of FORWARDED_REQUEST_HEADERS) {
    const v = req.headers.get(h);
    if (v) upstreamHeaders[h] = v;
  }
  // googlevideo occasionally rejects bare-Node UAs.
  upstreamHeaders["user-agent"] =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  let upstream: Response;
  try {
    upstream = await fetch(resolved.streamUrl, {
      headers: upstreamHeaders,
      // Don't follow to a non-googlevideo host. Defensive — googlevideo
      // generally redirects within its own CDN, but this kills a class of
      // SSRF vectors if a future yt-dlp bug returned an unexpected URL.
      redirect: "follow",
    });
  } catch {
    return new Response("Upstream fetch failed", { status: 502 });
  }

  // 200 (full response) and 206 (partial / Range) are both expected.
  if (!upstream.ok && upstream.status !== 206) {
    return new Response("Upstream error", { status: upstream.status });
  }

  const responseHeaders = new Headers();
  for (const h of FORWARDED_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) responseHeaders.set(h, v);
  }
  // Stream URLs are short-lived and signed for the requesting IP — never
  // cache the proxied bytes anywhere shared.
  responseHeaders.set("Cache-Control", "private, no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
