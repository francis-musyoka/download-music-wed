import { test, expect, beforeEach } from "vitest";
import { createTokenFetcher, createCircuitBreaker } from "../auth";

beforeEach(() => {
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    // Reset hoisted token + breaker state so each test starts fresh.
    const g = globalThis as typeof globalThis & {
        __downloadMusicSpotifyToken?: { accessToken: string | null; expiresAt: number };
        __downloadMusicSpotifyBreaker?: { failureCount: number; openUntil: number };
    };
    if (g.__downloadMusicSpotifyToken) {
        g.__downloadMusicSpotifyToken.accessToken = null;
        g.__downloadMusicSpotifyToken.expiresAt = 0;
    }
    if (g.__downloadMusicSpotifyBreaker) {
        g.__downloadMusicSpotifyBreaker.failureCount = 0;
        g.__downloadMusicSpotifyBreaker.openUntil = 0;
    }
});

test("createTokenFetcher caches the token until ~expiry", async () => {
    process.env.SPOTIFY_CLIENT_ID = "id";
    process.env.SPOTIFY_CLIENT_SECRET = "secret";

    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
        calls += 1;
        return new Response(
            JSON.stringify({ access_token: "tok", token_type: "Bearer", expires_in: 3600 }),
            { status: 200, headers: { "content-type": "application/json" } },
        );
    };
    const fetcher = createTokenFetcher({ fetchImpl });
    const t1 = await fetcher();
    const t2 = await fetcher();
    expect(t1).toBe("tok");
    expect(t2).toBe("tok");
    expect(calls).toBe(1);
});

test("createTokenFetcher refreshes when expiry is within 60s", async () => {
    process.env.SPOTIFY_CLIENT_ID = "id";
    process.env.SPOTIFY_CLIENT_SECRET = "secret";

    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
        calls += 1;
        return new Response(
            JSON.stringify({ access_token: `tok-${calls}`, token_type: "Bearer", expires_in: 30 }),
            { status: 200, headers: { "content-type": "application/json" } },
        );
    };
    const fetcher = createTokenFetcher({ fetchImpl });
    await fetcher();
    // Second call: token has 30s left, less than 60s safety margin → refresh.
    const t2 = await fetcher();
    expect(t2).toBe("tok-2");
    expect(calls).toBe(2);
});

test("createTokenFetcher throws when env missing", async () => {
    const fetchImpl: typeof fetch = async () => new Response("");
    const fetcher = createTokenFetcher({ fetchImpl });
    await expect(fetcher()).rejects.toThrow();
});

test("circuit breaker opens after 5 consecutive failures within 60s", () => {
    const cb = createCircuitBreaker({ threshold: 5, openMs: 60_000 });
    expect(cb.isOpen()).toBe(false);
    for (let i = 0; i < 5; i++) cb.recordFailure();
    expect(cb.isOpen()).toBe(true);
});

test("circuit breaker recordSuccess resets the failure count", () => {
    const cb = createCircuitBreaker({ threshold: 5, openMs: 60_000 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    for (let i = 0; i < 4; i++) cb.recordFailure();
    expect(cb.isOpen()).toBe(false);  // only 4 failures since last success
});

test("circuit breaker half-opens after openMs", () => {
    let fakeNow = 0;
    const cb = createCircuitBreaker({ threshold: 1, openMs: 10, now: () => fakeNow });
    cb.recordFailure();
    expect(cb.isOpen()).toBe(true);
    fakeNow = 100;
    expect(cb.isOpen()).toBe(false);  // window expired
});

test("createCircuitBreaker instances are independent", () => {
    const cbA = createCircuitBreaker({ threshold: 2 });
    const cbB = createCircuitBreaker({ threshold: 2 });
    cbA.recordFailure();
    cbA.recordFailure();
    expect(cbA.isOpen()).toBe(true);
    expect(cbB.isOpen()).toBe(false);
});
