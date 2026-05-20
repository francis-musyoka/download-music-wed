import { test, expect, beforeEach } from "vitest";
import { spotifyCache, type CacheKey } from "../cache";

beforeEach(() => {
    spotifyCache.clear();
});

test("get returns undefined for a key never set", () => {
    expect(spotifyCache.get("x")).toBeUndefined();
});

test("set then get returns the stored value when not expired", () => {
    spotifyCache.set("k", { hello: 1 }, 5_000);
    expect(spotifyCache.get("k")).toEqual({ hello: 1 });
});

test("get returns undefined and evicts when the entry has expired", () => {
    spotifyCache.set("k", "v", -1);  // already expired
    expect(spotifyCache.get("k")).toBeUndefined();
});

test("LRU evicts oldest entries when over cap", () => {
    // Cap is 1000; verify by inserting 1100 and checking the first 100 are gone.
    for (let i = 0; i < 1100; i++) {
        spotifyCache.set(`k${i}`, i, 60_000);
    }
    // After eviction trigger, some early keys should be gone:
    expect(spotifyCache.get("k0")).toBeUndefined();
    expect(spotifyCache.get("k1099")).toBe(1099);
});

test("dedup: two concurrent calls for the same key share one in-flight promise", async () => {
    let calls = 0;
    const loader = async (): Promise<number> => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 20));
        return 42;
    };
    const [a, b] = await Promise.all([
        spotifyCache.getOrLoad("dedup-key", 60_000, loader),
        spotifyCache.getOrLoad("dedup-key", 60_000, loader),
    ]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(calls).toBe(1);
});

test("getOrLoad caches the loader result", async () => {
    let calls = 0;
    const loader = async (): Promise<string> => {
        calls += 1;
        return "loaded";
    };
    await spotifyCache.getOrLoad("k", 60_000, loader);
    await spotifyCache.getOrLoad("k", 60_000, loader);
    expect(calls).toBe(1);
});

test("makeKey produces stable string for same params regardless of property order", () => {
    const k1: CacheKey = { endpoint: "searchTracks", params: { q: "a", limit: 5 } };
    const k2: CacheKey = { endpoint: "searchTracks", params: { limit: 5, q: "a" } };
    expect(spotifyCache.makeKey(k1)).toBe(spotifyCache.makeKey(k2));
});
