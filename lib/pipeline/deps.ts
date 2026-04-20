import { execFileSync, type ExecFileSyncOptions } from "node:child_process";
import { mkdirSync, statfsSync } from "node:fs";
import type { HealthStatus } from "../types";

// Pull runtime paths from the (CommonJS) constants module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MUSIC_DIR, PLAYLISTS_DIR } = require("./config/constants") as {
  MUSIC_DIR: string;
  PLAYLISTS_DIR: string;
};

const EXEC_OPTS: ExecFileSyncOptions = { stdio: "ignore" };

function hasBinary(bin: string): boolean {
  try {
    // `which` avoids running the target binary (no side effects, no network).
    execFileSync("which", [bin], EXEC_OPTS);
    return true;
  } catch {
    return false;
  }
}

function hasPlaywright(): boolean {
  try {
    require.resolve("playwright");
    return true;
  } catch {
    return false;
  }
}

function diskFreeGb(path: string): number | null {
  try {
    const s = statfsSync(path);
    // bavail is free blocks for unprivileged users; bsize is block size in bytes.
    const freeBytes = Number(s.bavail) * Number(s.bsize);
    return Math.round((freeBytes / (1024 ** 3)) * 10) / 10;
  } catch {
    return null;
  }
}

export function checkHealth(): HealthStatus {
  return {
    ytdlp: hasBinary("yt-dlp"),
    ffmpeg: hasBinary("ffmpeg"),
    spotdl: hasBinary("spotdl"),
    playwright: hasPlaywright(),
    diskFreeGb: diskFreeGb(MUSIC_DIR),
  };
}

/**
 * Idempotent — safe to call on every request. mkdirSync with recursive
 * is a no-op if the dir already exists.
 */
export function ensureDirs(): void {
  mkdirSync(MUSIC_DIR, { recursive: true });
  mkdirSync(PLAYLISTS_DIR, { recursive: true });
}
