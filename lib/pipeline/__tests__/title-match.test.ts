import { describe, test, expect } from "vitest";
import {
    findBestTitleMatch,
    matchesPrimaryArtist,
    normaliseForMatch,
} from "../utils/title-match.ts";
import type { Track } from "../../types.ts";

function t(title: string, artists: string[], videoId = "v1"): Track {
    return { videoId, title, artist: artists[0], artists } as Track & { artists: string[] };
}

describe("normaliseForMatch", () => {
    test("lowercases", () => {
        expect(normaliseForMatch("Hello World")).toBe("hello world");
    });
    test("strips punctuation", () => {
        expect(normaliseForMatch("Hello, World!")).toBe("hello world");
    });
    test("strips diacritics", () => {
        expect(normaliseForMatch("Café")).toBe("cafe");
    });
    test("collapses whitespace", () => {
        expect(normaliseForMatch("hello    world")).toBe("hello world");
    });
});

describe("findBestTitleMatch", () => {
    test("returns the exact-title match when artist also matches", () => {
        const candidates = [
            t("Cruel Summer", ["Taylor Swift"], "x"),
            t("Anti-Hero", ["Taylor Swift"], "y"),
        ];
        const match = findBestTitleMatch(candidates, "Taylor Swift", "Anti-Hero");
        expect(match?.videoId).toBe("y");
    });

    test("returns null when no candidate has the title", () => {
        const candidates = [
            t("Set Fire to the Rain", ["Adele"], "x"),
            t("Rolling in the Deep", ["Adele"], "y"),
        ];
        const match = findBestTitleMatch(candidates, "Adele", "Hello");
        expect(match).toBeNull();
    });

    test("does not match when title is right but artist is wrong", () => {
        const candidates = [t("Hello", ["Random Artist"], "x")];
        const match = findBestTitleMatch(candidates, "Adele", "Hello");
        expect(match).toBeNull();
    });

    test("is case-insensitive and punctuation-insensitive", () => {
        const candidates = [t("MONACO", ["Bad Bunny"], "x")];
        const match = findBestTitleMatch(candidates, "bad bunny", "Mónaco");
        expect(match?.videoId).toBe("x");
    });

    test("matches when query title is a substring (e.g. user typed 'water' for 'Water (Remix)')", () => {
        const candidates = [t("Water (Remix)", ["Tyla"], "x")];
        const match = findBestTitleMatch(candidates, "Tyla", "Water");
        expect(match?.videoId).toBe("x");
    });

    test("matches when artist appears in any position of artists[]", () => {
        const candidates = [t("Last Last", ["Some Featured Artist", "Burna Boy"], "x")];
        const match = findBestTitleMatch(candidates, "Burna Boy", "Last Last");
        expect(match?.videoId).toBe("x");
    });

    test("fuzzy fallback: 'Helo' matches 'Hello' when artist matches", () => {
        const candidates = [
            t("Easy On Me", ["Adele"], "a"),
            t("Hello", ["Adele"], "b"),
            t("Rolling in the Deep", ["Adele"], "c"),
        ];
        const match = findBestTitleMatch(candidates, "Adele", "Helo");
        expect(match?.videoId).toBe("b");
    });

    test("fuzzy fallback respects artist filter — close title with wrong artist is rejected", () => {
        // "Helo" is one edit away from both "Hello" (Adele) and "Halo" (Beyoncé).
        // We want Adele's Hello, not Beyoncé's Halo.
        const candidates = [
            t("Halo", ["Beyoncé"], "wrong"),
            t("Hello", ["Adele"], "right"),
        ];
        const match = findBestTitleMatch(candidates, "Adele", "Helo");
        expect(match?.videoId).toBe("right");
    });

    test("fuzzy match prefers exact substring over fuzzy when both exist", () => {
        // Two candidates: one with exact 'Hello' substring and one fuzzy match.
        // Exact wins per the two-pass design.
        const candidates = [
            t("Fuzzymatchable Helo Track", ["Adele"], "fuzzy"),
            t("Hello", ["Adele"], "exact"),
        ];
        const match = findBestTitleMatch(candidates, "Adele", "Hello");
        expect(match?.videoId).toBe("exact");
    });

    test("fuzzy match rejects too-distant titles", () => {
        // 'Hello' vs 'Set Fire to the Rain' — way over threshold.
        const candidates = [t("Set Fire to the Rain", ["Adele"], "x")];
        const match = findBestTitleMatch(candidates, "Adele", "Hello");
        expect(match).toBeNull();
    });
});

describe("matchesPrimaryArtist", () => {
    const make = (artists: string[]): Track =>
        ({ title: "x", artist: artists[0], artists } as Track & { artists: string[] });

    test("exact primary artist matches", () => {
        expect(matchesPrimaryArtist(make(["Adele"]), "Adele")).toBe(true);
    });

    test("case- and punctuation-insensitive", () => {
        expect(matchesPrimaryArtist(make(["Beyoncé"]), "beyonce")).toBe(true);
    });

    test("substring match — channel suffix like 'PopcaanVEVO' still matches 'Popcaan'", () => {
        expect(matchesPrimaryArtist(make(["PopcaanVEVO"]), "Popcaan")).toBe(true);
    });

    test("substring match in the OTHER direction — query 'Popcaan & Drake' matches primary 'Popcaan'", () => {
        // The track's primary "Popcaan" is contained in the user's longer query.
        expect(matchesPrimaryArtist(make(["Popcaan"]), "Popcaan & Drake")).toBe(true);
    });

    test("fuzzy fallback: removal typo 'Adel' matches 'Adele'", () => {
        expect(matchesPrimaryArtist(make(["Adele"]), "Adel")).toBe(true);
    });

    test("fuzzy fallback: insertion typo 'Adell' matches 'Adele'", () => {
        expect(matchesPrimaryArtist(make(["Adele"]), "Adell")).toBe(true);
    });

    test("fuzzy fallback: substitution typo 'Adelle' matches 'Adele'", () => {
        expect(matchesPrimaryArtist(make(["Adele"]), "Adelle")).toBe(true);
    });

    test("fuzzy fallback: 'Burna Boi' matches 'Burna Boy'", () => {
        expect(matchesPrimaryArtist(make(["Burna Boy"]), "Burna Boi")).toBe(true);
    });

    test("fuzzy fallback: 'popkan' matches 'Popcaan'", () => {
        expect(matchesPrimaryArtist(make(["Popcaan"]), "popkan")).toBe(true);
    });

    test("rejects when primary artist is a different artist (e.g. feature placement)", () => {
        // Track is "Davido feat. Popcaan" — primary is Davido. Searching Popcaan must drop it.
        expect(matchesPrimaryArtist(make(["Davido", "Popcaan"]), "Popcaan")).toBe(false);
    });

    test("rejects unrelated artists", () => {
        expect(matchesPrimaryArtist(make(["Drake"]), "Popcaan")).toBe(false);
    });

    test("rejects empty primary artist", () => {
        expect(matchesPrimaryArtist(make([""]), "Popcaan")).toBe(false);
    });

    test("rejects empty query artist", () => {
        expect(matchesPrimaryArtist(make(["Popcaan"]), "")).toBe(false);
    });
});
