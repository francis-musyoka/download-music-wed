import { describe, expect, it } from "vitest";
import { CURATED_GENRES, isCuratedGenre } from "../genres";

describe("isCuratedGenre", () => {
    it("matches exact entries from the curated list", () => {
        expect(isCuratedGenre("Afrobeats")).toBe(true);
        expect(isCuratedGenre("K-Pop")).toBe(true);
        expect(isCuratedGenre("R&B")).toBe(true);
    });

    it("is case-insensitive", () => {
        expect(isCuratedGenre("afrobeats")).toBe(true);
        expect(isCuratedGenre("AFROBEATS")).toBe(true);
        expect(isCuratedGenre("AfRoBeAtS")).toBe(true);
        expect(isCuratedGenre("hip-hop")).toBe(true);
    });

    it("trims surrounding whitespace", () => {
        expect(isCuratedGenre("  Jazz  ")).toBe(true);
        expect(isCuratedGenre("\tCountry\n")).toBe(true);
    });

    it("rejects non-curated input — the niches we dropped after empirical testing", () => {
        // Confirmed unusable via /tmp/genre-test-results.md (2026-05-22):
        // ytmusicapi tail-pads them with global pop, hit-score surfaces the pop.
        expect(isCuratedGenre("gengetone")).toBe(false);
        expect(isCuratedGenre("bongo flava")).toBe(false);
        expect(isCuratedGenre("lingala")).toBe(false);
        expect(isCuratedGenre("mugithi")).toBe(false);
        expect(isCuratedGenre("highlife")).toBe(false);
        expect(isCuratedGenre("indie")).toBe(false);
        expect(isCuratedGenre("punk")).toBe(false);
    });

    it("rejects empty / unknown input", () => {
        expect(isCuratedGenre("")).toBe(false);
        expect(isCuratedGenre("   ")).toBe(false);
        expect(isCuratedGenre("not-a-genre")).toBe(false);
    });

    it("exports a non-empty curated list", () => {
        expect(CURATED_GENRES.length).toBeGreaterThan(0);
        // Every entry must round-trip through the helper.
        for (const g of CURATED_GENRES) {
            expect(isCuratedGenre(g)).toBe(true);
        }
    });
});
