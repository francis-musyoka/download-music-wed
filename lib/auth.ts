import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

/**
 * Bearer-token check against the given env var. Always fail-closed: if the
 * env var isn't configured, or the request's Authorization header is
 * missing or doesn't match, the request is unauthorized. No open-access
 * fallback.
 */
export function isBearerAuthorized(req: Request, envVarName: string): boolean {
    const token = process.env[envVarName];
    if (!token) return false;
    const header = req.headers.get("authorization");
    if (!header) return false;
    return safeEqual(header, `Bearer ${token}`);
}
