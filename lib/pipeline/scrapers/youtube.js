const { spawn } = require("child_process");
const { MUSIC_DIR, MAX_DURATION, MIN_DURATION } = require("../config/constants");
const { isMixOrCompilation } = require("../utils/format");
const log = require("../utils/logger");

// Defense-in-depth: even though /api/download validates URLs at the route
// boundary, downloadTrack() also validates so a future caller (new route,
// changed candidate source) can't accidentally point yt-dlp at non-YouTube
// hosts. yt-dlp supports hundreds of extractors — keep it locked to YouTube.
// Duplicated from app/api/download/route.ts#ALLOWED_URL_HOSTS; can't cleanly
// share because this module is CommonJS and the route is TypeScript.
const ALLOWED_URL_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
]);

// yt-dlp cookies file. When set, passed via --cookies to all yt-dlp calls in
// this module. Same file shape as lib/preview-resolver.ts already uses.
const COOKIES_FILE = process.env.YT_DLP_COOKIES || "";

/**
 * Search YouTube via yt-dlp and return metadata for each result.
 * Returns: [{ videoId, title, url, views, duration, uploadDate, channel }]
 */
function searchYouTube(query, count = 5) {
    return new Promise((resolve, reject) => {
        const args = [
            "--force-ipv4", // see downloadTrack: YouTube 403s datacenter IPv6
            `ytsearch${count}:${query}`,
            "--flat-playlist",
            "--dump-json",
            "--no-download",
        ];

        // stdin: "ignore" so yt-dlp can never block on an interactive prompt
        // (cookie/format selection). Server stdin is wired to the Node process,
        // and a hanging yt-dlp holds an inflight slot until the 2h sweep.
        const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (d) => (stdout += d.toString()));
        proc.stderr.on("data", (d) => (stderr += d.toString()));

        proc.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(`yt-dlp search failed: ${stderr.slice(0, 200)}`));
                return;
            }

            const results = stdout
                .split("\n")
                .filter((l) => l.trim())
                .map((l) => {
                    try { return JSON.parse(l); } catch { return null; }
                })
                .filter(Boolean)
                .map((r) => ({
                    videoId: r.id,
                    title: r.title || "",
                    url: `https://www.youtube.com/watch?v=${r.id}`,
                    views: r.view_count || 0,
                    duration: r.duration || 0,
                    uploadDate: r.upload_date || null,
                    channel: r.channel || r.uploader || "",
                }));

            resolve(results);
        });
    });
}

/**
 * Search YouTube for a specific song by artist + title.
 * Filters results to find the best match (single track, not a mix).
 * Returns the best matching result or null.
 */
async function findBestMatch(artist, title) {
    const query = `${artist} - ${title} official audio`;
    const results = await searchYouTube(query, 5);

    // Filter: must be a single track, not a mix
    const valid = results.filter((r) => {
        if (r.duration > MAX_DURATION) return false;
        if (r.duration < MIN_DURATION) return false;
        if (isMixOrCompilation(r.title)) return false;
        return true;
    });

    if (valid.length === 0) return null;

    // Prefer the one with most views (likely the official version)
    valid.sort((a, b) => b.views - a.views);
    return valid[0];
}

/**
 * Download a single video as MP3.
 * Returns the file path of the downloaded MP3, or null on failure.
 */
function downloadTrack(url, outputDir = MUSIC_DIR) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new URL(url);
        } catch {
            reject(new Error("Invalid URL passed to downloadTrack"));
            return;
        }
        if (
            parsed.protocol !== "https:" ||
            !ALLOWED_URL_HOSTS.has(parsed.hostname.toLowerCase())
        ) {
            reject(new Error(`Blocked non-YouTube URL: ${parsed.hostname}`));
            return;
        }

        const outputTemplate = `${outputDir}/%(title)s.%(ext)s`;

        const args = [
            // Prefer IPv4 — datacenter IPv6 ranges (e.g. Contabo) see heavier
            // YouTube throttling. This is hardening, NOT a complete fix: the
            // main 403 cause is YouTube's per-video PO-token requirement, which
            // needs a PO token provider running on the host (see deploy docs).
            "--force-ipv4",
            // Retry transient CDN failures (sporadic 403/416 on the byte-fetch)
            // rather than failing the whole track on the first hiccup.
            "--retries",
            "3",
            "--fragment-retries",
            "3",
            "--extractor-retries",
            "2",
            "-x",
            "--audio-format",
            "mp3",
            "--audio-quality",
            "0",
            "--embed-thumbnail",
            "--add-metadata",
            ...(COOKIES_FILE ? ["--cookies", COOKIES_FILE] : []),
            // Opt in to fetching the EJS (challenge solver) script from
            // yt-dlp's own GitHub release. Without this, recent yt-dlp
            // versions refuse to auto-download the solver and YouTube's
            // signature / n-param challenges fail — only image formats
            // come back, no MP3. Pairs with a JS runtime (Deno) on PATH.
            "--remote-components",
            "ejs:github",
            "-o",
            outputTemplate,
            "--print",
            "after_move:filepath",
            "--no-overwrites",
            url,
        ];

        // stdin: "ignore" — see searchYouTube above for rationale.
        const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (d) => {
            // Capture for filename parsing at close; don't echo to the server's
            // stdout — yt-dlp is chatty (per-% progress, ffmpeg postproc, ANSI
            // escapes) and would drown the pino log stream.
            stdout += d.toString();
        });

        proc.stderr.on("data", (d) => {
            const text = d.toString();
            stderr += text;
            // Only surface real ERROR lines, and route them through the structured
            // logger so they respect LOG_LEVEL and land as proper JSON events.
            if (text.includes("ERROR")) log.warn(`yt-dlp: ${text.trim()}`);
        });

        proc.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(`Download failed: ${stderr.slice(0, 200)}`));
                return;
            }

            const files = stdout
                .split("\n")
                .map((l) => l.trim())
                .filter((l) => l.endsWith(".mp3"));

            resolve(files[0] || null);
        });
    });
}

/**
 * Search YouTube for a song and download it as MP3.
 * Returns { filePath, videoData } or null on failure.
 */
async function searchAndDownload(artist, title, outputDir = MUSIC_DIR) {
    const match = await findBestMatch(artist, title);
    if (!match) {
        log.warn(`No YouTube match found for "${artist} - ${title}"`);
        return null;
    }

    try {
        const filePath = await downloadTrack(match.url, outputDir);
        return filePath ? { filePath, videoData: match } : null;
    } catch (err) {
        log.warn(`Failed to download "${artist} - ${title}": ${err.message}`);
        return null;
    }
}

module.exports = {
    searchYouTube,
    findBestMatch,
    downloadTrack,
    searchAndDownload,
};
