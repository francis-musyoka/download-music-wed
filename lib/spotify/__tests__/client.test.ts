import { test, expect, beforeEach } from "vitest";
import { createSpotifyClient, spotifyAvailable } from "../client";
import { spotifyCache } from "../cache";

beforeEach(() => {
    process.env.SPOTIFY_CLIENT_ID = "id";
    process.env.SPOTIFY_CLIENT_SECRET = "secret";
    spotifyCache.clear();
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

function tokenResponse(): Response {
    return new Response(
        JSON.stringify({ access_token: "tok", token_type: "Bearer", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
    );
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
        ...init,
    });
}

test("searchTracks returns parsed track items", async () => {
    const fetchImpl: typeof fetch = async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/token")) return tokenResponse();
        return jsonResponse({
            tracks: {
                items: [
                    {
                        id: "x",
                        name: "Essence",
                        artists: [{ id: "a", name: "Wizkid" }],
                        album: { id: "y", name: "Made in Lagos", release_date: "2020-10-30" },
                        duration_ms: 248000,
                        popularity: 78,
                        external_ids: { isrc: "ISRC1" },
                        uri: "spotify:track:x",
                    },
                ],
                total: 1,
            },
        });
    };
    const client = createSpotifyClient({ fetchImpl });
    const tracks = await client.searchTracks("Essence Wizkid");
    expect(tracks.length).toBe(1);
    expect(tracks[0].name).toBe("Essence");
});

test("getArtistTopTracks returns the tracks array", async () => {
    const fetchImpl: typeof fetch = async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/token")) return tokenResponse();
        return jsonResponse({
            tracks: [
                {
                    id: "x",
                    name: "x",
                    artists: [{ id: "a", name: "A" }],
                    album: { id: "y", name: "y", release_date: "2024" },
                    duration_ms: 1000,
                    popularity: 0,
                    external_ids: {},
                    uri: "spotify:track:x",
                },
            ],
        });
    };
    const client = createSpotifyClient({ fetchImpl });
    const tracks = await client.getArtistTopTracks("artistId");
    expect(tracks.length).toBe(1);
});

test("retries once on 5xx then succeeds", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/token")) return tokenResponse();
        calls += 1;
        if (calls === 1) return new Response("oops", { status: 502 });
        return jsonResponse({ tracks: { items: [], total: 0 } });
    };
    const client = createSpotifyClient({ fetchImpl });
    const tracks = await client.searchTracks("x");
    expect(tracks).toEqual([]);
    expect(calls).toBe(2);
});

test("caches identical searchTracks calls", async () => {
    let apiCalls = 0;
    const fetchImpl: typeof fetch = async (input) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/token")) return tokenResponse();
        apiCalls += 1;
        return jsonResponse({ tracks: { items: [], total: 0 } });
    };
    const client = createSpotifyClient({ fetchImpl });
    await client.searchTracks("same query");
    await client.searchTracks("same query");
    expect(apiCalls).toBe(1);
});

test("spotifyAvailable returns false when env vars missing", () => {
    delete process.env.SPOTIFY_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_SECRET;
    // spotifyAvailable reads process.env at call time, so static import is fine.
    expect(spotifyAvailable()).toBe(false);
});

test("spotifyAvailable returns true when env vars present and breaker closed", () => {
    process.env.SPOTIFY_CLIENT_ID = "id";
    process.env.SPOTIFY_CLIENT_SECRET = "secret";
    expect(spotifyAvailable()).toBe(true);
});
