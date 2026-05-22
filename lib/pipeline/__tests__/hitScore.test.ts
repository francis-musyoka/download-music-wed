import { describe, test, expect } from "vitest";
import type { Track } from "../../types.ts";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { rankCandidates, hitScore, newBoost } = require("../scoring/hitScore.js");

function track(partial: Partial<Track>): Track {
    return { title: "t", artist: "a", ...partial };
}

describe("newBoost (bucketed)", () => {
    test.each([
        [0,           0.3],
        [99_999,      0.3],
        [100_000,     0.6],
        [499_999,     0.6],
        [500_000,     1.0],
        [999_999,     1.0],
        [1_000_000,   1.3],
        [4_999_999,   1.3],
        [5_000_000,   1.5],
        [9_999_999,   1.5],
        [10_000_000,  1.8],
        [50_000_000,  1.8],
        [999_999_999, 1.8],
    ])("views=%i → boost=%f", (views, expected) => {
        expect(newBoost(views)).toBe(expected);
    });
});

describe("hitScore", () => {
    test("log-views only when inNewPool=false", () => {
        const s = hitScore(track({ views: 1_000_000, inNewPool: false }));
        expect(s).toBeCloseTo(6.0, 5);
    });

    test("adds bucket boost when inNewPool=true", () => {
        const s = hitScore(track({ views: 1_000_000, inNewPool: true }));
        expect(s).toBeCloseTo(7.3, 5);
    });

    test("zero views handled without crash", () => {
        const s = hitScore(track({ views: 0, inNewPool: false }));
        expect(s).toBe(0);
    });

    test("undefined views treated as 0", () => {
        const s = hitScore(track({ inNewPool: false }));
        expect(s).toBe(0);
    });

    test("new 50M and new 12M get the same +1.8 boost (flat above 10M)", () => {
        const a = hitScore(track({ views: 50_000_000, inNewPool: true }));
        const b = hitScore(track({ views: 12_000_000, inNewPool: true }));
        const aBase = Math.log10(50_000_000);
        const bBase = Math.log10(12_000_000);
        expect(a - aBase).toBeCloseTo(1.8, 5);
        expect(b - bBase).toBeCloseTo(1.8, 5);
    });
});

describe("rankCandidates (worked example from spec)", () => {
    test("a new 5M outranks an old 100M", () => {
        const new5M = track({ videoId: "n", views: 5_000_000, inNewPool: true });
        const old100M = track({ videoId: "o", views: 100_000_000, inNewPool: false });
        const ranked = rankCandidates([old100M, new5M]);
        expect(ranked[0].videoId).toBe("n");
    });

    test("a new 20K does NOT outrank an old 1M", () => {
        const new20K = track({ videoId: "n", views: 20_000, inNewPool: true });
        const old1M = track({ videoId: "o", views: 1_000_000, inNewPool: false });
        const ranked = rankCandidates([new20K, old1M]);
        expect(ranked[0].videoId).toBe("o");
    });

    test("among new tracks, higher views ranks higher", () => {
        const a = track({ videoId: "a", views: 5_000_000, inNewPool: true });
        const b = track({ videoId: "b", views: 1_000_000, inNewPool: true });
        const c = track({ videoId: "c", views: 100_000, inNewPool: true });
        const ranked = rankCandidates([c, a, b]) as Track[];
        expect(ranked.map((t) => t.videoId)).toEqual(["a", "b", "c"]);
    });
});
