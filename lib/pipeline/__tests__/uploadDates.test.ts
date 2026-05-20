import { test, expect } from "vitest";
import type { Track } from "../../types.ts";
import { __testing as __up } from "../enrich/uploadDates.ts";

function track(p: Partial<Track>): Track {
    return { title: "t", artist: "a", ...p };
}

test("skips candidates without videoId", async () => {
    const rows = [track({ videoId: undefined })];
    let calls = 0;
    await __up.fetchUploadDatesWith(rows, async () => { calls++; return "20240101"; }, { concurrency: 2 });
    expect(calls).toBe(0);
    expect(rows[0].uploadDate).toBe(undefined);
});

test("skips candidates that already have uploadDate", async () => {
    const rows = [track({ videoId: "abc", uploadDate: "20230101" })];
    let calls = 0;
    await __up.fetchUploadDatesWith(rows, async () => { calls++; return "20240101"; }, { concurrency: 2 });
    expect(calls).toBe(0);
    expect(rows[0].uploadDate).toBe("20230101");
});

test("populates uploadDate on success", async () => {
    const rows = [track({ videoId: "abc" }), track({ videoId: "def" })];
    await __up.fetchUploadDatesWith(rows, async (id) => id === "abc" ? "20240101" : "20240202", { concurrency: 2 });
    expect(rows[0].uploadDate).toBe("20240101");
    expect(rows[1].uploadDate).toBe("20240202");
});

test("isolates per-candidate failures — one reject leaves others unaffected", async () => {
    const rows = [track({ videoId: "a" }), track({ videoId: "b" }), track({ videoId: "c" })];
    await __up.fetchUploadDatesWith(rows, async (id) => {
        if (id === "b") throw new Error("boom");
        return "20240101";
    }, { concurrency: 2 });
    expect(rows[0].uploadDate).toBe("20240101");
    expect(rows[1].uploadDate).toBe(undefined);
    expect(rows[2].uploadDate).toBe("20240101");
});

test("respects concurrency cap", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => track({ videoId: `v${i}` }));
    let inFlight = 0;
    let peak = 0;
    await __up.fetchUploadDatesWith(rows, async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight--;
        return "20240101";
    }, { concurrency: 2 });
    expect(peak <= 2, `peak ${peak} > cap 2`).toBeTruthy();
    expect(rows.every((r) => r.uploadDate === "20240101")).toBeTruthy();
});

test("parseUploadDate rejects non-8-digit output", () => {
    expect(() => __up.parseUploadDate("NA")).toThrow();
    expect(() => __up.parseUploadDate("")).toThrow();
    expect(() => __up.parseUploadDate("2024-01-01")).toThrow();
});

test("parseUploadDate accepts YYYYMMDD", () => {
    expect(__up.parseUploadDate("20240101")).toBe("20240101");
    expect(__up.parseUploadDate("  20240101\n")).toBe("20240101");
});
