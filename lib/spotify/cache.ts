const LRU_CAP = 1000;
const LRU_EVICT_BATCH = 100;

interface Entry {
    data: unknown;
    expiresAt: number;
}

type GlobalWithCache = typeof globalThis & {
    __downloadMusicSpotifyCache?: Map<string, Entry>;
    __downloadMusicSpotifyInflight?: Map<string, Promise<unknown>>;
};

const g = globalThis as GlobalWithCache;
const store: Map<string, Entry> =
    g.__downloadMusicSpotifyCache ?? (g.__downloadMusicSpotifyCache = new Map());
const inflight: Map<string, Promise<unknown>> =
    g.__downloadMusicSpotifyInflight ?? (g.__downloadMusicSpotifyInflight = new Map());

export interface CacheKey {
    endpoint: string;
    params: Record<string, unknown>;
}

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
        return "[" + value.map(stableStringify).join(",") + "]";
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

function evictExpired(now: number): void {
    for (const [k, e] of store) {
        if (e.expiresAt <= now) store.delete(k);
    }
}

function evictLruIfOverCap(): void {
    if (store.size <= LRU_CAP) return;
    // Sort by expiresAt ascending; oldest-expiring first counts as "least valuable."
    const entries = Array.from(store.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (let i = 0; i < Math.min(LRU_EVICT_BATCH, entries.length); i++) {
        store.delete(entries[i][0]);
    }
}

export const spotifyCache = {
    makeKey(key: CacheKey): string {
        return `${key.endpoint}:${stableStringify(key.params)}`;
    },

    get<T>(key: string): T | undefined {
        const now = Date.now();
        const e = store.get(key);
        if (!e) return undefined;
        if (e.expiresAt <= now) {
            store.delete(key);
            return undefined;
        }
        return e.data as T;
    },

    set<T>(key: string, data: T, ttlMs: number): void {
        store.set(key, { data, expiresAt: Date.now() + ttlMs });
        evictLruIfOverCap();
    },

    async getOrLoad<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
        const cached = this.get<T>(key);
        if (cached !== undefined) return cached;

        const pending = inflight.get(key) as Promise<T> | undefined;
        if (pending) return pending;

        const promise = (async () => {
            try {
                const result = await loader();
                this.set(key, result, ttlMs);
                return result;
            } finally {
                inflight.delete(key);
            }
        })();

        inflight.set(key, promise as Promise<unknown>);
        return promise;
    },

    clear(): void {
        store.clear();
        inflight.clear();
    },

    size(): number {
        return store.size;
    },

    _evictExpired(now: number = Date.now()): void {
        evictExpired(now);
    },
};
