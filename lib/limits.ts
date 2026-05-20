const WINDOW_MS = 60_000;
const MAX_PER_IP_DEFAULT = 10;
const MAX_PER_IP_HEAVY = 5;       // genre + artist (Playwright + LLM batch)
const MAX_INFLIGHT = 4;
const MAX_EXPENSIVE_DAY = Number(process.env.DAILY_QUOTA_LIMIT ?? 12);
const MAX_OVERALL_DAY = Number(process.env.DAILY_OVERALL_LIMIT ?? 150);

interface Bucket { count: number; resetAt: number; }
interface DayBuckets {
    date: number;             // ms-timestamp of next UTC midnight (the resetAt)
    overall: number;
    expensive: number;
}

type GlobalWithLimits = typeof globalThis & {
    __dmRateBuckets?: Map<string, Bucket>;
    __dmDayBuckets?: Map<string, DayBuckets>;
    __dmInflight?: { count: number };
};
const g = globalThis as GlobalWithLimits;
const BUCKETS: Map<string, Bucket> =
    g.__dmRateBuckets ?? (g.__dmRateBuckets = new Map());
const DAY_BUCKETS: Map<string, DayBuckets> =
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

function getOrInitDayBucket(sessionId: string): DayBuckets {
    const now = Date.now();
    if (DAY_BUCKETS.size > 5000) {
        for (const [k, b] of DAY_BUCKETS) {
            if (b.date <= now) DAY_BUCKETS.delete(k);
        }
    }
    const existing = DAY_BUCKETS.get(sessionId);
    if (existing && existing.date > now) return existing;
    const fresh: DayBuckets = { date: nextUtcMidnightFrom(now), overall: 0, expensive: 0 };
    DAY_BUCKETS.set(sessionId, fresh);
    return fresh;
}

/** Read-only check. Returns null when allowed, seconds-to-reset when at limit. */
export function checkOverallDaily(sessionId: string): number | null {
    const b = getOrInitDayBucket(sessionId);
    if (b.overall >= MAX_OVERALL_DAY) {
        return Math.ceil((b.date - Date.now()) / 1000);
    }
    return null;
}

/** Read-only check. Returns null when allowed, seconds-to-reset when at limit. */
export function checkExpensiveDaily(sessionId: string): number | null {
    const b = getOrInitDayBucket(sessionId);
    if (b.expensive >= MAX_EXPENSIVE_DAY) {
        return Math.ceil((b.date - Date.now()) / 1000);
    }
    return null;
}

export function incrementOverallDaily(sessionId: string): void {
    const b = getOrInitDayBucket(sessionId);
    b.overall += 1;
}

export function incrementExpensiveDaily(sessionId: string): void {
    const b = getOrInitDayBucket(sessionId);
    b.expensive += 1;
}

export interface DailyQuotaTier {
    used: number;
    limit: number;
}

export interface DailyQuotaResponse {
    overall: DailyQuotaTier;
    expensive: DailyQuotaTier;
    resetAt: number;
}

export function readDailyQuota(sessionId: string): DailyQuotaResponse {
    const b = getOrInitDayBucket(sessionId);
    return {
        overall: { used: b.overall, limit: MAX_OVERALL_DAY },
        expensive: { used: b.expensive, limit: MAX_EXPENSIVE_DAY },
        resetAt: b.date,
    };
}

export function reserveSlot(): boolean {
    if (INFLIGHT.count >= MAX_INFLIGHT) return false;
    INFLIGHT.count += 1;
    return true;
}

export function releaseSlot(): void {
    INFLIGHT.count = Math.max(0, INFLIGHT.count - 1);
}

/** Test-only. */
export function _resetForTest(): void {
    BUCKETS.clear();
    DAY_BUCKETS.clear();
    INFLIGHT.count = 0;
}
