const WINDOW_MS = 60_000;
const MAX_PER_IP = 8;             // per-IP per-minute — any mode
const MAX_INFLIGHT = 4;           // global concurrent jobs

// Two daily tiers per session:
//   overall   — every genre/artist/song call burns one
//   expensive — only burns when rerankCandidates actually fires (genre + LLM up)
// Tunable via .env so prod can bump them without a redeploy.
const MAX_PER_SESSION_DAY_OVERALL = parseIntEnv("DAILY_OVERALL_LIMIT", 150);
const MAX_PER_SESSION_DAY_EXPENSIVE = parseIntEnv("DAILY_EXPENSIVE_LIMIT", 30);

function parseIntEnv(name: string, fallback: number): number {
    const v = process.env[name];
    if (!v) return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

interface Bucket { count: number; resetAt: number; }
interface DayBucket { count: number; resetAt: number; }

type GlobalWithLimits = typeof globalThis & {
    __dmRateBuckets?: Map<string, Bucket>;
    __dmDayOverall?: Map<string, DayBucket>;
    __dmDayExpensive?: Map<string, DayBucket>;
    __dmInflight?: { count: number };
};
const g = globalThis as GlobalWithLimits;
const BUCKETS: Map<string, Bucket> =
    g.__dmRateBuckets ?? (g.__dmRateBuckets = new Map());
const DAY_OVERALL: Map<string, DayBucket> =
    g.__dmDayOverall ?? (g.__dmDayOverall = new Map());
const DAY_EXPENSIVE: Map<string, DayBucket> =
    g.__dmDayExpensive ?? (g.__dmDayExpensive = new Map());
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
export function checkRate(ip: string): number | null {
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
    if (bucket.count >= MAX_PER_IP) {
        return Math.ceil((bucket.resetAt - now) / 1000);
    }
    bucket.count += 1;
    return null;
}

function consumeFrom(
    bucketMap: Map<string, DayBucket>,
    sessionId: string,
    max: number,
): number | null {
    const now = Date.now();
    if (bucketMap.size > 5000) {
        for (const [k, b] of bucketMap) {
            if (b.resetAt <= now) bucketMap.delete(k);
        }
    }
    const bucket = bucketMap.get(sessionId);
    if (!bucket || bucket.resetAt <= now) {
        bucketMap.set(sessionId, { count: 1, resetAt: nextUtcMidnightFrom(now) });
        return null;
    }
    if (bucket.count >= max) {
        return Math.ceil((bucket.resetAt - now) / 1000);
    }
    bucket.count += 1;
    return null;
}

function peekFrom(
    bucketMap: Map<string, DayBucket>,
    sessionId: string,
    max: number,
): number | null {
    const now = Date.now();
    const bucket = bucketMap.get(sessionId);
    if (!bucket || bucket.resetAt <= now) return null;
    if (bucket.count >= max) {
        return Math.ceil((bucket.resetAt - now) / 1000);
    }
    return null;
}

/**
 * Overall daily cap (every genre / artist / song call burns one).
 * Increments-and-checks; returns null when allowed or retry-seconds when blocked.
 */
export function consumeDailyOverall(sessionId: string): number | null {
    return consumeFrom(DAY_OVERALL, sessionId, MAX_PER_SESSION_DAY_OVERALL);
}

/**
 * Expensive daily cap (rerankCandidates calls only). Check WITHOUT incrementing
 * — the increment is deferred until after the LLM call actually fires, so a
 * degraded rerank doesn't burn the user's expensive quota. Pair with
 * consumeDailyExpensive() in the rank's `result.ok` branch.
 */
export function peekDailyExpensive(sessionId: string): number | null {
    return peekFrom(DAY_EXPENSIVE, sessionId, MAX_PER_SESSION_DAY_EXPENSIVE);
}

/**
 * Increment the expensive bucket. Called only after rerankCandidatesSafe
 * returns ok. Does NOT check the cap — peekDailyExpensive() gated us before
 * the work started, and we still want to record that the expensive call
 * happened even on a marginal race condition.
 */
export function consumeDailyExpensive(sessionId: string): void {
    const now = Date.now();
    const bucket = DAY_EXPENSIVE.get(sessionId);
    if (!bucket || bucket.resetAt <= now) {
        DAY_EXPENSIVE.set(sessionId, { count: 1, resetAt: nextUtcMidnightFrom(now) });
        return;
    }
    bucket.count += 1;
}

export interface DailyQuota {
    used: number;
    max: number;
    resetsAt: number;
}

export interface DailyQuotaSnapshot {
    overall: DailyQuota;
    expensive: DailyQuota;
}

/** Read-only quota lookup for the UI (does NOT increment either bucket). */
export function readDaily(sessionId: string): DailyQuotaSnapshot {
    const now = Date.now();
    const nextMidnight = nextUtcMidnightFrom(now);
    const readBucket = (
        bucket: DayBucket | undefined,
        max: number,
    ): DailyQuota => {
        if (!bucket || bucket.resetAt <= now) {
            return { used: 0, max, resetsAt: nextMidnight };
        }
        return { used: bucket.count, max, resetsAt: bucket.resetAt };
    };
    return {
        overall: readBucket(DAY_OVERALL.get(sessionId), MAX_PER_SESSION_DAY_OVERALL),
        expensive: readBucket(DAY_EXPENSIVE.get(sessionId), MAX_PER_SESSION_DAY_EXPENSIVE),
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

export function getInflightCount(): number {
    return INFLIGHT.count;
}
