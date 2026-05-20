import { test, expect } from "vitest";
import { rankSpotifyCandidates } from "../hitScoreV2";
import type { Track } from "@/lib/types";

function track(over: Partial<Track>): Track {
    return {
        title: "t",
        artist: "a",
        popularity: 50,
        editorialPlaylistCount: 1,
        releaseDate: "2024-01-01",
        ...over,
    } as Track;
}

test("rankSpotifyCandidates returns empty for empty input", () => {
    expect(rankSpotifyCandidates([])).toEqual([]);
});

test("higher popularity ranks higher", () => {
    const ranked = rankSpotifyCandidates([
        track({ title: "low", popularity: 20 }),
        track({ title: "high", popularity: 90 }),
    ]);
    expect(ranked[0].title).toBe("high");
});

test("editorial playlist count tie-breaks at equal popularity", () => {
    const ranked = rankSpotifyCandidates([
        track({ title: "one-list", popularity: 50, editorialPlaylistCount: 1 }),
        track({ title: "five-lists", popularity: 50, editorialPlaylistCount: 5 }),
    ]);
    expect(ranked[0].title).toBe("five-lists");
});

test("recent releases boost score", () => {
    const today = new Date().toISOString().slice(0, 10);
    const ranked = rankSpotifyCandidates([
        track({ title: "old", popularity: 50, releaseDate: "2010-01-01" }),
        track({ title: "new", popularity: 50, releaseDate: today }),
    ]);
    expect(ranked[0].title).toBe("new");
});

test("single candidate is returned unchanged with a score", () => {
    const ranked = rankSpotifyCandidates([track({ title: "only" })]);
    expect(ranked.length).toBe(1);
    expect(typeof ranked[0].score).toBe("number");
});

test("missing release_date does not crash", () => {
    const ranked = rankSpotifyCandidates([
        track({ title: "no-date", releaseDate: undefined }),
        track({ title: "has-date", releaseDate: "2024-01-01" }),
    ]);
    expect(ranked.length).toBe(2);
});

test("recencyScore handles YYYY-only release_date", () => {
    // 2024-01-01 is "old" enough to land in the < 365 days range only if test runs
    // close to today; use a definitively old year and check the score is below the
    // "<30 days" 1.0 bucket.
    const ranked = rankSpotifyCandidates([
        track({ title: "year-only", releaseDate: "2010" }),
    ]);
    // Score includes 100% weight on recency for this single-candidate batch.
    // 2010 is well over 365 days old → recency = 0.1 → weighted contrib = 20 * 0.1 = 2
    // popularity normalized to 0 (single candidate, min=max), editorial likewise 0.
    expect(ranked[0].score).toBe(2);
});

test("recencyScore handles YYYY-MM release_date without falling through to neutral 0.3", () => {
    // YYYY-MM in the distant past should also land in the >365-days bucket (0.1),
    // NOT the neutral fallback (0.3). Score should be 50*0 + 30*0 + 20*0.1 = 2.
    const ranked = rankSpotifyCandidates([
        track({ title: "month-precision", releaseDate: "2010-03" }),
    ]);
    expect(ranked[0].score).toBe(2);
});

test("recencyScore handles malformed release_date by returning neutral 0.3", () => {
    const ranked = rankSpotifyCandidates([
        track({ title: "garbage", releaseDate: "not-a-date" }),
    ]);
    // Neutral 0.3 * 20 = 6.
    expect(ranked[0].score).toBe(6);
});
