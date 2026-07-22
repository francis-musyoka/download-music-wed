import { promises as fs } from "node:fs";
import path from "node:path";
import {
    MUSIC_DIR,
    PLAYLISTS_DIR,
} from "@/lib/pipeline/config/constants";

// Disk grows unbounded otherwise: every download leaves an MP3 in MUSIC_DIR
// and every ZIP/M3U export leaves files in PLAYLISTS_DIR. This sweeper removes
// files older than CLEANUP_MAX_AGE_DAYS on a CLEANUP_INTERVAL_HOURS cadence.
// See TODO.md #1.

const DEFAULT_MAX_AGE_DAYS = 1;
const DEFAULT_INTERVAL_HOURS = 6;
const DEFAULT_LOG_PATH = "./disk-cleanup.log";

function envNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

const MAX_AGE_MS =
    envNumber("CLEANUP_MAX_AGE_DAYS", DEFAULT_MAX_AGE_DAYS) *
    24 * 60 * 60 * 1000;
const INTERVAL_MS =
    envNumber("CLEANUP_INTERVAL_HOURS", DEFAULT_INTERVAL_HOURS) *
    60 * 60 * 1000;
const LOG_PATH = process.env.CLEANUP_LOG_PATH || DEFAULT_LOG_PATH;

// Append-only audit trail so deletions can be traced later — one line per
// sweep, always written (even when nothing was deleted), so a gap in the
// log is itself a signal the sweeper stopped running.
async function logCleanup(musicDeleted: number, playlistsDeleted: number): Promise<void> {
    const line = `${new Date().toISOString()} disk-cleanup totalDeleted=${musicDeleted + playlistsDeleted} (music=${musicDeleted}, playlists=${playlistsDeleted})\n`;
    try {
        await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
        await fs.appendFile(LOG_PATH, line);
    } catch (err) {
        console.error(`[disk-cleanup] failed to write log file ${LOG_PATH}:`, err);
    }
}

async function sweepDir(dir: string): Promise<number> {
    let entries: string[];
    try {
        entries = await fs.readdir(dir);
    } catch (err) {
        // ENOENT is benign — the directory just hasn't been created yet
        // (no downloads/playlists generated since this deploy).
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
        console.error(`[disk-cleanup] readdir ${dir} failed:`, err);
        return 0;
    }

    const cutoff = Date.now() - MAX_AGE_MS;
    let deleted = 0;

    for (const name of entries) {
        const filePath = path.join(dir, name);
        try {
            const st = await fs.stat(filePath);
            // Skip subdirectories — current pipeline writes flat, but if a
            // future feature nests folders we don't want to nuke them blindly.
            if (!st.isFile()) continue;
            // mtime, not atime — atime is unreliable on noatime mounts.
            // A file being actively downloaded has a fresh mtime, so this also
            // protects in-flight writes.
            if (st.mtimeMs >= cutoff) continue;
            await fs.unlink(filePath);
            deleted++;
        } catch (err) {
            console.error(`[disk-cleanup] failed on ${filePath}:`, err);
        }
    }

    return deleted;
}

async function sweep(): Promise<void> {
    const [music, playlists] = await Promise.all([
        sweepDir(MUSIC_DIR),
        sweepDir(PLAYLISTS_DIR),
    ]);
    if (music + playlists > 0) {
        console.log(
            `[disk-cleanup] removed ${music} music + ${playlists} playlist files (older than ${MAX_AGE_MS / 86_400_000}d)`,
        );
    }
    await logCleanup(music, playlists);
}

// Hoist the timer onto globalThis so the sweeper survives Next.js dev-mode
// module re-evaluation and `register()` re-entries — mirrors the pattern in
// lib/jobs.ts:159-167.
type GlobalWithCleanup = typeof globalThis & {
    __downloadMusicDiskCleanup?: NodeJS.Timeout;
};
const g = globalThis as GlobalWithCleanup;

export function startDiskCleanup(): void {
    if (g.__downloadMusicDiskCleanup) return;
    // One eager pass on boot so files that accumulated while the process was
    // down get cleared promptly, not INTERVAL_MS later.
    void sweep();
    const t = setInterval(() => void sweep(), INTERVAL_MS);
    t.unref?.();
    g.__downloadMusicDiskCleanup = t;
}
