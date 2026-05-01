const WINDOW_MS = 60_000;
const MAX_PER_IP_DEFAULT = 10;
const MAX_PER_IP_HEAVY = 5;       // genre + artist (Playwright + LLM batch)
const MAX_INFLIGHT = 4;
const MAX_PER_SESSION_DAY = 12;   // genre + artist combined per session per day

interface Bucket { count: number; resetAt: number; }
interface DayBucket { count: number; resetAt: number; }

type GlobalWithLimits = typeof globalThis & {
  __dmRateBuckets?: Map<string, Bucket>;
  __dmDayBuckets?: Map<string, DayBucket>;
  __dmInflight?: { count: number };
};
const g = globalThis as GlobalWithLimits;
const BUCKETS: Map<string, Bucket> =
  g.__dmRateBuckets ?? (g.__dmRateBuckets = new Map());
const DAY_BUCKETS: Map<string, DayBucket> =
  g.__dmDayBuckets ?? (g.__dmDayBuckets = new Map());
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

function nextUtcMidnightFrom(now: number): number {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

/** Returns null when allowed; returns retry seconds when rate-limited. */
export function checkRate(ip: string, heavy: boolean): number | null {
  const max = heavy ? MAX_PER_IP_HEAVY : MAX_PER_IP_DEFAULT;
  const now = Date.now();
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
  if (bucket.count >= max) {
    return Math.ceil((bucket.resetAt - now) / 1000);
  }
  bucket.count += 1;
  return null;
}

/**
 * Per-session daily cap (genre + artist combined). Returns null when allowed,
 * or seconds-to-reset when blocked. Does NOT increment if already at the cap.
 */
export function checkDaily(sessionId: string): number | null {
  const now = Date.now();
  if (DAY_BUCKETS.size > 5000) {
    for (const [k, b] of DAY_BUCKETS) {
      if (b.resetAt <= now) DAY_BUCKETS.delete(k);
    }
  }
  const bucket = DAY_BUCKETS.get(sessionId);
  if (!bucket || bucket.resetAt <= now) {
    DAY_BUCKETS.set(sessionId, { count: 1, resetAt: nextUtcMidnightFrom(now) });
    return null;
  }
  if (bucket.count >= MAX_PER_SESSION_DAY) {
    return Math.ceil((bucket.resetAt - now) / 1000);
  }
  bucket.count += 1;
  return null;
}

export interface DailyQuota {
  used: number;
  max: number;
  resetsAt: number;
}

/** Read-only quota lookup (does NOT increment). For the UI indicator. */
export function readDaily(sessionId: string): DailyQuota {
  const now = Date.now();
  const bucket = DAY_BUCKETS.get(sessionId);
  if (!bucket || bucket.resetAt <= now) {
    return { used: 0, max: MAX_PER_SESSION_DAY, resetsAt: nextUtcMidnightFrom(now) };
  }
  return { used: bucket.count, max: MAX_PER_SESSION_DAY, resetsAt: bucket.resetAt };
}

export function reserveSlot(): boolean {
  if (INFLIGHT.count >= MAX_INFLIGHT) return false;
  INFLIGHT.count += 1;
  return true;
}

export function releaseSlot(): void {
  INFLIGHT.count = Math.max(0, INFLIGHT.count - 1);
}
