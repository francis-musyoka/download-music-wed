const log = require("../utils/logger");

/** @typedef {import("../../types.ts").Track} Track */

// Resolve the Python interpreter once per process. YTMUSIC_PYTHON wins; falls
// back to `python3` on PATH. We do not parse a venv layout here — the env var
// is the single source of truth.
const PYTHON_BIN = process.env.YTMUSIC_PYTHON || "python3";

// Path to the script, relative to the project root (process.cwd() in dev/prod
// because Next.js launches from there).
const SCRIPT_PATH = "lib/pipeline/scrapers/ytmusic_search.py";

// Max stdout we accept from the subprocess. 500 song results × ~600 bytes each
// is ~300 KB; we cap at 4 MB to leave headroom for future limits without ever
// truncating real-world payloads.
const MAX_BUFFER = 4 * 1024 * 1024;

// Soft timeout. The Python side is doing a single InnerTube call (or a small
// number of internal pages); 60s is generous and bounds catastrophic hangs.
const TIMEOUT_MS = 60_000;

/**
 * One search call.
 *
 * @param {string} query
 * @param {number} limit
 * @param {{ tags?: { inNewPool?: boolean } }} [opts]
 * @returns {Promise<Track[]>}
 */
async function searchSongs(query, limit, opts = {}) {
  const tags = opts.tags || {};
  // Dynamic import (not top-level require) so `vi.mock("node:child_process")`
  // in tests can intercept this. Vitest's mock registry reliably patches
  // dynamic import() but not require() of Node built-ins. Production overhead
  // is negligible — Node caches the module after the first call.
  const { execFile } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    execFile(
      PYTHON_BIN,
      [SCRIPT_PATH, "search", String(query), "songs", String(limit)],
      { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`ytmusic_search failed: ${stderr.slice(0, 300) || err.message}`));
          return;
        }
        let raw;
        try {
          raw = JSON.parse(stdout);
        } catch (parseErr) {
          log.warn(`ytmusic_search returned non-JSON for "${query}": ${parseErr.message}`);
          resolve([]);
          return;
        }
        if (!Array.isArray(raw)) {
          log.warn(`ytmusic_search returned non-array for "${query}"`);
          resolve([]);
          return;
        }
        resolve(raw.map((r) => toTrack(r, tags)));
      },
    );
  });
}

function toTrack(raw, tags) {
  return {
    videoId: raw.videoId || undefined,
    title: raw.title || "",
    artist: raw.artist || "Unknown",
    // `artists` is a free-form list of channel names; we keep it for the
    // wide-artist-match filter in artist mode. Not part of the Track type
    // today but used internally — see lib/pipeline/orchestrator.ts.
    artists: Array.isArray(raw.artists) ? raw.artists : [],
    duration: typeof raw.duration_seconds === "number" ? raw.duration_seconds : 0,
    views: typeof raw.views === "number" ? raw.views : 0,
    position: typeof raw.position === "number" ? raw.position : 0,
    videoUrl: raw.videoId ? `https://www.youtube.com/watch?v=${raw.videoId}` : undefined,
    source: "youtube-music",
    inNewPool: !!tags.inNewPool,
  };
}

module.exports = { searchSongs, toTrack };
