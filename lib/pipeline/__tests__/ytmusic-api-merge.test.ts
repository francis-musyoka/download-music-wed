import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

import { execFile } from "node:child_process";
import { searchSongsParallel } from "../scrapers/ytmusic-api.js";

const execMock = execFile as unknown as ReturnType<typeof vi.fn>;

function mockResponse(stdout: string, code = 0) {
    execMock.mockImplementationOnce(
        (_bin: string, _args: string[], _opts: object, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
            const err = code === 0 ? null : Object.assign(new Error("exit"), { code });
            cb(err, stdout, "");
        },
    );
}

function fakeResult(videoId: string, position: number) {
    return {
        videoId,
        title: `title-${videoId}`,
        artist: `artist-${videoId}`,
        artists: [`artist-${videoId}`],
        album_id: null,
        album_name: null,
        duration_seconds: 200,
        views: 10_000,
        position,
    };
}

beforeEach(() => execMock.mockReset());

describe("searchSongsParallel", () => {
    test("merges by videoId — inNewPool=true wins (OR semantics)", async () => {
        // Call 1 (q):           [v1@0, v2@1]   inNewPool=false
        // Call 2 (q+"hits"):    [v2@3, v3@4]   inNewPool=false
        // Call 3 (q+"new"):     [v1@2, v3@5]   inNewPool=true
        mockResponse(JSON.stringify([fakeResult("v1", 0), fakeResult("v2", 1)]));
        mockResponse(JSON.stringify([fakeResult("v2", 3), fakeResult("v3", 4)]));
        mockResponse(JSON.stringify([fakeResult("v1", 2), fakeResult("v3", 5)]));

        const tracks = await searchSongsParallel(
            [
                { query: "q",         tags: { inNewPool: false } },
                { query: "q hits",    tags: { inNewPool: false } },
                { query: "q new",     tags: { inNewPool: true  } },
            ],
            200,
        );

        expect(tracks).toHaveLength(3);
        const byId = Object.fromEntries(tracks.map((t) => [t.videoId, t]));

        // v1 was in queries 1 (false) and 3 (true) → inNewPool=true
        expect(byId.v1.inNewPool).toBe(true);
        // v2 was in queries 1 (false) and 2 (false) → inNewPool=false
        expect(byId.v2.inNewPool).toBe(false);
        // v3 was in queries 2 (false) and 3 (true) → inNewPool=true
        expect(byId.v3.inNewPool).toBe(true);
    });

    test("position is the minimum across appearances", async () => {
        mockResponse(JSON.stringify([fakeResult("v1", 5)]));
        mockResponse(JSON.stringify([fakeResult("v1", 2)]));
        mockResponse(JSON.stringify([fakeResult("v1", 7)]));

        const tracks = await searchSongsParallel(
            [
                { query: "a", tags: {} },
                { query: "b", tags: {} },
                { query: "c", tags: {} },
            ],
            200,
        );

        expect(tracks).toHaveLength(1);
        expect(tracks[0].position).toBe(2);
    });

    test("runs all calls in parallel (no awaits between)", async () => {
        let resolveOrder: string[] = [];
        execMock.mockImplementationOnce((_b, _a, _o, cb) => {
            setTimeout(() => { resolveOrder.push("a"); cb(null, "[]", ""); }, 50);
        });
        execMock.mockImplementationOnce((_b, _a, _o, cb) => {
            setTimeout(() => { resolveOrder.push("b"); cb(null, "[]", ""); }, 10);
        });

        await searchSongsParallel([{ query: "a", tags: {} }, { query: "b", tags: {} }], 200);
        expect(resolveOrder).toEqual(["b", "a"]);
    });

    test("one failing call does not break the others — survivors returned", async () => {
        mockResponse(JSON.stringify([fakeResult("v1", 0)]));
        mockResponse("", 3); // fails
        mockResponse(JSON.stringify([fakeResult("v2", 0)]));

        const tracks = await searchSongsParallel(
            [
                { query: "a", tags: {} },
                { query: "b", tags: {} },
                { query: "c", tags: {} },
            ],
            200,
        );

        const ids = tracks.map((t) => t.videoId).sort();
        expect(ids).toEqual(["v1", "v2"]);
    });
});
