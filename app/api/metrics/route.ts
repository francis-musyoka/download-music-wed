import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { register } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

function isAuthorized(req: Request): boolean {
    const token = process.env.METRICS_AUTH_TOKEN;
    if (!token) return true;
    const header = req.headers.get("authorization");
    if (!header) return false;
    return safeEqual(header, `Bearer ${token}`);
}

export async function GET(req: Request) {
    if (!isAuthorized(req)) {
        return new NextResponse("Unauthorized", { status: 401 });
    }
    return new NextResponse(await register.metrics(), {
        headers: { "Content-Type": register.contentType },
    });
}
