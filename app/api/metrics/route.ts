import { NextResponse } from "next/server";
import { register } from "@/lib/metrics";
import { isBearerAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    if (!isBearerAuthorized(req, "METRICS_AUTH_TOKEN")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }
    return new NextResponse(await register.metrics(), {
        headers: { "Content-Type": register.contentType },
    });
}
