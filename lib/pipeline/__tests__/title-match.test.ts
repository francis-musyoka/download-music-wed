import { describe, test, expect } from "vitest";
import { findBestTitleMatch, normaliseForMatch } from "../utils/title-match.ts";
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
});
