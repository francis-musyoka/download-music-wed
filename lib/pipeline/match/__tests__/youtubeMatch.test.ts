import { test, expect } from "vitest";
import { confidence, pickBestMatch } from "../youtubeMatch";

const spotifyTrack = {
    id: "x",
    name: "Essence",
    artist: "Wizkid",
    durationMs: 248_000,
};

test("confidence is 0 when duration mismatch exceeds 3 seconds", () => {
    const c = confidence(spotifyTrack, {
        videoId: "v",
        title: "Essence",
        channel: "WizkidVEVO",
        durationSec: 300,
    });
    expect(c).toBe(0);
});

test("confidence is high for exact title+artist+duration with official channel", () => {
    const c = confidence(spotifyTrack, {
        videoId: "v",
        title: "Essence - Wizkid",
        channel: "WizkidVEVO",
        durationSec: 248,
    });
    expect(c).toBeGreaterThan(0.7);
});

test("confidence is medium when title matches but channel is unofficial", () => {
    const c = confidence(spotifyTrack, {
        videoId: "v",
        title: "Essence Wizkid",
        channel: "MusicFan123",
        durationSec: 248,
    });
    expect(c).toBeGreaterThan(0.4);
    expect(c).toBeLessThan(0.7);
});

test("pickBestMatch returns null when no candidate clears the threshold", async () => {
    const result = await pickBestMatch(spotifyTrack, [
        { videoId: "v1", title: "Wrong Song", channel: "x", durationSec: 248 },
    ]);
    expect(result).toBeNull();
});

test("pickBestMatch returns the highest-confidence candidate above 0.7 without consulting LLM", async () => {
    let llmCalled = false;
    const result = await pickBestMatch(
        spotifyTrack,
        [
            { videoId: "v1", title: "Essence - Wizkid", channel: "WizkidVEVO", durationSec: 248 },
            { videoId: "v2", title: "Essence remix", channel: "x", durationSec: 248 },
        ],
        {
            askLLM: async () => {
                llmCalled = true;
                return null;
            },
        },
    );
    expect(result?.videoId).toBe("v1");
    expect(llmCalled).toBe(false);
});

test("pickBestMatch consults LLM tiebreaker for borderline matches", async () => {
    let llmCalled = false;
    const result = await pickBestMatch(
        spotifyTrack,
        [{ videoId: "v1", title: "Essence Wizkid", channel: "MusicFan123", durationSec: 248 }],
        {
            askLLM: async () => {
                llmCalled = true;
                return "v1";
            },
        },
    );
    expect(result?.videoId).toBe("v1");
    expect(llmCalled).toBe(true);
});

test("pickBestMatch returns null when LLM rejects borderline candidate", async () => {
    const result = await pickBestMatch(
        spotifyTrack,
        [{ videoId: "v1", title: "Essence Wizkid", channel: "MusicFan123", durationSec: 248 }],
        { askLLM: async () => null },
    );
    expect(result).toBeNull();
});
