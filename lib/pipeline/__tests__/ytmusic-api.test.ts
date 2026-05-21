import { describe, test, expect, vi, beforeEach } from "vitest";
import type { Track } from "../../types.ts";

// We mock node:child_process at the module boundary. The wrapper imports
// execFile from there; tests inject fake stdout/exit.
vi.mock("node:child_process", () => {
    return {
        execFile: vi.fn(),
    };
});

import { execFile } from "node:child_process";
import { searchSongs } from "../scrapers/ytmusic-api.js";

const execMock = execFile as unknown as ReturnType<typeof vi.fn>;

function mockOnce(stdout: string, code = 0, stderr = "") {
    execMock.mockImplementationOnce(
        (_bin: string, _args: string[], _opts: object, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
            const err = code === 0 ? null : Object.assign(new Error("exit"), { code });
            cb(err, stdout, stderr);
        },
    );
}

beforeEach(() => {
    execMock.mockReset();
});

describe("searchSongs", () => {
    test("parses JSON output into Track[] with views as int and inNewPool from opts.tags", async () => {
        mockOnce(JSON.stringify([
            {
                videoId: "BBD690j6VcA",
                title: "Gimme Dat",
                artist: "Ayra Starr",
                artists: ["Ayra Starr", "Wizkid"],
                album_id: "MPREb_HDxPW2tm0xn",
                album_name: "Gimme Dat",
                duration_seconds: 226,
                views: 24_000_000,
                position: 0,
            },
        ]));

        const tracks: Track[] = await searchSongs("afrobeats", 20, { tags: { inNewPool: true } });

        expect(tracks).toHaveLength(1);
        expect(tracks[0].videoId).toBe("BBD690j6VcA");
        expect(tracks[0].title).toBe("Gimme Dat");
        expect(tracks[0].artist).toBe("Ayra Starr");
        expect(tracks[0].views).toBe(24_000_000);
        expect(tracks[0].duration).toBe(226);
        expect(tracks[0].position).toBe(0);
        expect(tracks[0].inNewPool).toBe(true);
        expect(tracks[0].source).toBe("youtube-music");
    });

    test("argv array contains no shell metacharacters and no { shell: true }", async () => {
        mockOnce("[]");
        await searchSongs("afrobeats; rm -rf /", 200);

        expect(execMock).toHaveBeenCalledTimes(1);
        const [bin, args, opts] = execMock.mock.calls[0];
        expect(bin).toMatch(/python3?$/);
        expect(args).toEqual([
            "lib/pipeline/scrapers/ytmusic_search.py",
            "search",
            "afrobeats; rm -rf /",
            "songs",
            "200",
        ]);
        expect(opts).not.toHaveProperty("shell");
    });

    test("rejects when the script exits non-zero", async () => {
        mockOnce("", 3, "boom");
        await expect(searchSongs("x", 20)).rejects.toThrow(/ytmusic_search/);
    });

    test("returns [] when JSON parse fails (logged warn, not throw)", async () => {
        mockOnce("not-json");
        const tracks = await searchSongs("x", 20);
        expect(tracks).toEqual([]);
    });

    test("inNewPool=false when no tags supplied", async () => {
        mockOnce(JSON.stringify([
            {
                videoId: "v1",
                title: "t",
                artist: "a",
                artists: ["a"],
                album_id: null,
                album_name: null,
                duration_seconds: 200,
                views: 10,
                position: 0,
            },
        ]));
        const tracks = await searchSongs("x", 20);
        expect(tracks[0].inNewPool).toBe(false);
    });
});
