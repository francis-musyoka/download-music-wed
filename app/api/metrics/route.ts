import { NextResponse } from "next/server";
import { register } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


function isAuthorized(req: Request): boolean {
    const token = process.env.METRICS_AUTH_TOKEN;
    if (!token) return true;
    return req.headers.get("authorization") === `Bearer ${token}`;
}

export async function GET(req: Request) {
    if (!isAuthorized(req)) {
        return new NextResponse("Unauthorized", { status: 401 });
    }
    return new NextResponse(await register.metrics(), {
        headers: { "Content-Type": register.contentType },
    });
}
