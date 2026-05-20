import { test, expect } from "vitest";
import {
    SpotifyTrackSchema,
    SpotifyPlaylistSchema,
    SpotifySearchTracksResponseSchema,
    SpotifyArtistTopTracksResponseSchema,
} from "../schemas";

test("SpotifyTrackSchema parses a minimal valid track", () => {
    const parsed = SpotifyTrackSchema.parse({
        id: "1Lo5gXFI1NRSAZeFwfNHKa",
        name: "Essence",
        artists: [{ id: "3tVQdUvClmAT7URs9V3rsp", name: "Wizkid" }],
        album: { id: "abc", name: "Made in Lagos", release_date: "2020-10-30" },
        duration_ms: 248000,
        popularity: 78,
        external_ids: { isrc: "USUM72101234" },
        uri: "spotify:track:1Lo5gXFI1NRSAZeFwfNHKa",
    });
    expect(parsed.id).toBe("1Lo5gXFI1NRSAZeFwfNHKa");
    expect(parsed.popularity).toBe(78);
    expect(parsed.external_ids?.isrc).toBe("USUM72101234");
});

test("SpotifyTrackSchema accepts a track without ISRC", () => {
    const parsed = SpotifyTrackSchema.parse({
        id: "x",
        name: "x",
        artists: [{ id: "a", name: "A" }],
        album: { id: "y", name: "y", release_date: "2024" },
        duration_ms: 1000,
        popularity: 0,
        external_ids: {},
        uri: "spotify:track:x",
    });
    expect(parsed.external_ids?.isrc).toBeUndefined();
});

test("SpotifyTrackSchema rejects an invalid popularity range", () => {
    expect(() =>
        SpotifyTrackSchema.parse({
            id: "x",
            name: "x",
            artists: [{ id: "a", name: "A" }],
            album: { id: "y", name: "y", release_date: "2024" },
            duration_ms: 1000,
            popularity: 150,
            external_ids: {},
            uri: "spotify:track:x",
        }),
    ).toThrow();
});

test("SpotifySearchTracksResponseSchema parses a search response", () => {
    const parsed = SpotifySearchTracksResponseSchema.parse({
        tracks: {
            items: [
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
            total: 1,
        },
    });
    expect(parsed.tracks.items.length).toBe(1);
});

test("SpotifyArtistTopTracksResponseSchema parses the top-tracks wrapper", () => {
    const parsed = SpotifyArtistTopTracksResponseSchema.parse({
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
    expect(parsed.tracks.length).toBe(1);
});

test("SpotifyTrackSchema accepts a simplified track (no popularity, no external_ids)", () => {
    const parsed = SpotifyTrackSchema.parse({
        id: "x",
        name: "x",
        artists: [{ id: "a", name: "A" }],
        album: { id: "y", name: "y", release_date: "2024" },
        duration_ms: 1000,
        uri: "spotify:track:x",
    });
    expect(parsed.id).toBe("x");
    expect(parsed.popularity).toBeUndefined();
    expect(parsed.external_ids).toBeUndefined();
});
