import { NextResponse } from "next/server";
import { readDaily } from "@/lib/limits";
import { getOrSetSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const res = NextResponse.json({});
  const sessionId = getOrSetSession(req, res);
  const quota = readDaily(sessionId);
  return new NextResponse(JSON.stringify(quota), {
    status: 200,
    headers: res.headers,
  });
}
