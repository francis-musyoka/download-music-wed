import { randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";

const COOKIE_NAME = "dm_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Read the session cookie off the request. If absent, mint a new 32-byte
 * base64url token, attach Set-Cookie to the outgoing response, and return it.
 */
export function getOrSetSession(req: Request, res: NextResponse): string {
  const existing = readCookie(req, COOKIE_NAME);
  if (existing) return existing;
  const token = randomBytes(32).toString("base64url");
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${THIRTY_DAYS}`,
  ];
  if (process.env.NODE_ENV === "production") attrs.push("Secure");
  res.headers.append("Set-Cookie", attrs.join("; "));
  return token;
}

export function readSession(req: Request): string | null {
  return readCookie(req, COOKIE_NAME);
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}
