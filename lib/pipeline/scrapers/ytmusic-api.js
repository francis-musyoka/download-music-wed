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

// Lazy singleton Promise for the child_process module. Using a single shared
// Promise means concurrent callers all await the same resolution — they never
// race to initialise the module twice, which matters when Vitest's vi.mock
// patches the registry: the first awaiter registers the mock, and all
// subsequent awaiters reuse the already-resolved (mocked) module reference.
let _cpPromise = null;
function getChildProcess() {
    if (!_cpPromise) _cpPromise = import("node:child_process");
    return _cpPromise;
}

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
    // Dynamic import via shared lazy singleton so vi.mock("node:child_process")
    // in tests intercepts reliably — even when searchSongs is called in parallel.
    // See getChildProcess() above for rationale.
    const { execFile } = await getChildProcess();
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

/**
 * Run N searches in parallel and merge by videoId.
 *
 * Merge rules:
 *   • inNewPool = OR of all occurrences' tags.inNewPool
 *     (a track surfaced by both `q` and `q+"new"` is treated as new)
 *   • position = minimum across appearances (highest-relevance rank wins)
 *   • All other fields = from the first occurrence
 *
 * Failures in individual queries are logged and skipped, not propagated.
 *
 * @param {Array<{ query: string, tags?: { inNewPool?: boolean } }>} queryDefs
 * @param {number} limit
 * @returns {Promise<Track[]>}
 */
async function searchSongsParallel(queryDefs, limit) {
    const settled = await Promise.allSettled(
        queryDefs.map((def) => searchSongs(def.query, limit, { tags: def.tags || {} })),
    );

    const merged = new Map();
    for (const result of settled) {
        if (result.status === "rejected") {
            log.warn(`searchSongsParallel: one query failed: ${result.reason?.message ?? result.reason}`);
            continue;
        }
        for (const t of result.value) {
            if (!t.videoId) continue;
            const existing = merged.get(t.videoId);
            if (!existing) {
                merged.set(t.videoId, { ...t });
                continue;
            }
            // OR-merge: any "new" appearance promotes the merged track
            if (t.inNewPool) existing.inNewPool = true;
            // Position: keep the smallest (highest-relevance) value
            if (typeof t.position === "number" && t.position < existing.position) {
                existing.position = t.position;
            }
        }
    }
    return Array.from(merged.values());
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

module.exports = { searchSongs, searchSongsParallel, toTrack };
