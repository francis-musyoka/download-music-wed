import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/pipeline/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(checkHealth());
}
