// Per-IP token bucket + global in-flight cap. Single-process only; state is
// hoisted onto globalThis so HMR-reloaded modules share the same counters.
const WINDOW_MS = 60_000;
const MAX_PER_IP = 10;
const MAX_INFLIGHT = 4;

interface Bucket { count: number; resetAt: number; }

type GlobalWithLimits = typeof globalThis & {
  __dmRateBuckets?: Map<string, Bucket>;
  __dmInflight?: { count: number };
};
const g = globalThis as GlobalWithLimits;
const BUCKETS: Map<string, Bucket> =
  g.__dmRateBuckets ?? (g.__dmRateBuckets = new Map());
const INFLIGHT = g.__dmInflight ?? (g.__dmInflight = { count: 0 });

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "local";
}

/** Returns null when allowed; returns retry seconds when rate-limited. */
export function checkRate(ip: string): number | null {
  const now = Date.now();
  // Opportunistic sweep when the map grows large — mirrors preview cache.
  if (BUCKETS.size > 1000) {
    for (const [k, b] of BUCKETS) {
      if (b.resetAt <= now) BUCKETS.delete(k);
    }
  }
  const bucket = BUCKETS.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    BUCKETS.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return null;
  }
  if (bucket.count >= MAX_PER_IP) {
    return Math.ceil((bucket.resetAt - now) / 1000);
  }
  bucket.count += 1;
  return null;
}

export function reserveSlot(): boolean {
  if (INFLIGHT.count >= MAX_INFLIGHT) return false;
  INFLIGHT.count += 1;
  return true;
}

export function releaseSlot(): void {
  INFLIGHT.count = Math.max(0, INFLIGHT.count - 1);
}
