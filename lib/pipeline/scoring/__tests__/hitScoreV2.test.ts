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
