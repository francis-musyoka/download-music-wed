const { chromium } = require("playwright");
const log = require("../utils/logger");
const { dedupKey, isMixOrCompilation } = require("../utils/format");
const { MAX_DURATION, MIN_DURATION } = require("../config/constants");
const { getGenreConfig } = require("../config/genres");

// Overall wall-clock budget for a single scraper call (collectCandidates or
// collectArtistCandidates). Each call holds one of the 4 global inflight
// slots, so a stuck scrape blocks other users. `page.goto` already has its
// own 30s timeout; this bounds the *sum* of all per-query operations.
// Soft deadline: checked between queries, so the last query may finish
// slightly past the budget — acceptable, partial results are still useful.
const SCRAPER_TIMEOUT_MS = 120_000;

// Upper bound on the number of distinct scrape queries per call. Prevents
// LLM-derived search terms from blowing up wall time even when many are returned.
const MAX_SCRAPE_QUERIES = 10;

const SCRAPE_CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY || 3);

// Pre-accept Google's EU consent banner. Without these cookies, headless
// Chromium running on European/datacenter IPs (e.g. Contabo) lands on the
// consent wall instead of the search results, our selector wait times out,
// and the pipeline returns 0 candidates for every query.
async function newScrapingContext(browser) {
    const context = await browser.newContext({
        userAgent:
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    await context.addCookies([
        { name: "CONSENT", value: "YES+", domain: ".youtube.com", path: "/" },
        { name: "SOCS", value: "CAI", domain: ".youtube.com", path: "/" },
        { name: "CONSENT", value: "YES+", domain: ".google.com", path: "/" },
    ]);
    return context;
}

/**
 * Parse play count string like "759m plays" → 759000000
 */
function parsePlayCount(str) {
    if (!str) return 0;
    const match = str.toLowerCase().match(/([\d.]+)\s*(b|m|k)?/);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    const unit = match[2];
    if (unit === "b") return num * 1_000_000_000;
    if (unit === "m") return num * 1_000_000;
    if (unit === "k") return num * 1_000;
    return num;
}

/**
 * Parse duration string like "3:06" → 186 seconds
 */
function parseDuration(str) {
    if (!str) return 0;
    const match = str.match(/(\d+):(\d+):?(\d+)?/);
    if (!match) return 0;
    if (match[3]) {
        // h:mm:ss
        return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
    }
    // m:ss
    return parseInt(match[1]) * 60 + parseInt(match[2]);
}

// Type chips YouTube Music prepends to subtitles when the "Songs" filter is
// not active. Lower-cased for case-insensitive matching.
const SUBTITLE_TYPE_CHIPS = new Set([
    "song", "video", "album", "single", "ep",
    "episode", "podcast", "playlist", "artist", "profile",
]);

const SUBTITLE_DURATION_RE = /^\d+:\d{2}(?::\d{2})?$/;

/**
 * Parse the subtitle column from YouTube Music.
 *
 * Old format: "Artist • Album • Duration".
 * New format (mixed results, type chip prefixed): "Song • Artist • Album • Duration"
 * or "Video • Channel • Duration".
 *
 * Strips a leading type chip and pulls duration positionally so a stray field
 * (e.g. a year in the album slot) doesn't push the duration out of reach.
 */
function parseSubtitle(text) {
    if (!text) return { artist: "Unknown", album: "", durationStr: "" };
    let parts = text.split("•").map((s) => s.trim()).filter(Boolean);
    if (parts[0] && SUBTITLE_TYPE_CHIPS.has(parts[0].toLowerCase())) {
        parts = parts.slice(1);
    }
    let durationStr = "";
    if (parts.length && SUBTITLE_DURATION_RE.test(parts[parts.length - 1])) {
        durationStr = parts[parts.length - 1];
        parts = parts.slice(0, -1);
    }
    return {
        artist: parts[0] || "Unknown",
        album: parts.slice(1).join(" • "),
        durationStr,
    };
}

/**
 * Scrape YouTube Music search results for a query.
 * Clicks the "Songs" filter to get individual tracks only.
 * Returns array of { title, artist, album, duration, plays, videoId, url }
 */
async function scrapeYTMusicSearch(page, query) {
    try {
        const searchUrl = `https://music.youtube.com/search?q=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        try {
            await page.waitForSelector("ytmusic-responsive-list-item-renderer", { timeout: 10_000 });
        } catch {
            // No results rendered in time — let the subsequent evaluate() return [].
            return [];
        }

        // Try to click "Songs" filter — but don't fail if it's not visible.
        // YT Music's filter-chip element name and aria differ across versions, so
        // try a list of selectors in order. Note: `text=Songs` (substring match)
        // is intentionally NOT used — it greedily matches the bold search-term
        // echo on the results page (e.g. "burna boy popular **songs**") whose
        // click never resolves, costing 5s per query and skipping the filter.
        try {
            const filterSelectors = [
                'ytmusic-chip-cloud-chip-renderer:has(yt-formatted-string:text-is("Songs"))',
                'ytmusic-chip-cloud-chip-renderer:has-text("Songs")',
                'chip-cloud-chip-renderer:has-text("Songs")',
                'a[title="Show song results"]',
            ];
            let clicked = false;
            for (const sel of filterSelectors) {
                const chip = await page.$(sel);
                if (chip) {
                    await chip.click({ timeout: 5000 });
                    clicked = true;
                    break;
                }
            }
            if (!clicked) throw new Error("Songs filter chip not found in DOM");
            // After the filter click, the list re-renders. Wait for the renderer to
            // re-appear so our subsequent evaluate() sees the filtered set.
            await page.waitForSelector("ytmusic-responsive-list-item-renderer", { timeout: 5_000 });
        } catch (err) {
            log.warn(`YT Music "Songs" filter unavailable for "${query}" — continuing with mixed results: ${err.message}`);
        }

        const rawResults = await page.evaluate(() => {
            const results = [];
            // When the Songs filter click fails (selector stale, chip hidden),
            // the page still has every shelf — Albums, Videos, Community
            // Playlists, etc. Iterating all `ytmusic-responsive-list-item-
            // renderer`s pollutes the pool with non-songs that downstream
            // duration/title filters then reject, leaving ~2 songs per query.
            // Prefer the "Songs" shelf when present; fall back to all rows
            // otherwise (filter succeeded → whole page is songs; or no Songs
            // shelf → degrade to prior behaviour).
            const shelves = document.querySelectorAll("ytmusic-shelf-renderer");
            let scope = null;
            for (const shelf of shelves) {
                const header = shelf.querySelector("yt-formatted-string.title, .title");
                const headerText = (header && header.textContent ? header.textContent : "").trim();
                if (headerText === "Songs") {
                    scope = shelf;
                    break;
                }
            }
            const rows = (scope || document).querySelectorAll("ytmusic-responsive-list-item-renderer");

            rows.forEach((row) => {
                const flexCols = row.querySelectorAll(".flex-columns yt-formatted-string");
                const texts = Array.from(flexCols).map((el) => el.textContent.trim());
                const linkEl = row.querySelector('a[href*="watch"]');
                const href = linkEl ? linkEl.getAttribute("href") : "";

                if (texts.length >= 2 && href) {
                    results.push({
                        title: texts[0],
                        subtitle: texts[1],
                        plays: texts[2] || "",
                        href,
                    });
                }
            });

            return results;
        });

        // Parse and filter results
        const songs = [];
        for (const raw of rawResults) {
            const { artist, album, durationStr } = parseSubtitle(raw.subtitle);
            const duration = parseDuration(durationStr);
            const plays = parsePlayCount(raw.plays);

            // Extract video ID
            const vidMatch = raw.href.match(/watch\?v=([a-zA-Z0-9_-]+)/);
            if (!vidMatch) continue;

            // Filter out mixes/compilations by duration
            if (duration > MAX_DURATION) continue;
            if (duration > 0 && duration < MIN_DURATION) continue;

            // Filter out mixes by title
            if (isMixOrCompilation(raw.title)) continue;

            // Filter out DJ/compilation artists
            const lowerArtist = artist.toLowerCase();
            if (lowerArtist.startsWith("dj ") || lowerArtist.includes("various")) continue;

            songs.push({
                title: raw.title,
                artist,
                album,
                duration,
                plays,
                videoId: vidMatch[1],
                url: `https://www.youtube.com/watch?v=${vidMatch[1]}`,
            });
        }

        return songs;
    } catch (err) {
        log.warn(`YT Music search failed for "${query}": ${err.message}`);
        return [];
    }
}

/**
 * Main entry point: collect candidates for a genre from YouTube Music.
 *
 * Uses multiple search queries to build a large candidate pool,
 * then merges and deduplicates.
 *
 * Returns array of:
 * {
 *   title, artist, album, duration, plays (streams),
 *   videoId, url, playlistCount, bestPosition, source
 * }
 */
async function collectCandidates(genre, opts = {}) {
    const { config } = getGenreConfig(genre);
    const extraSearchTerms = Array.isArray(opts.extraSearchTerms) ? opts.extraSearchTerms : [];

    log.header(`Collecting candidates for: ${config.displayName}`);

    const browser = await chromium.launch({ headless: true });
    const context = await newScrapingContext(browser);
    const page = await context.newPage();

    try {
        // Multiple search queries to get a broad pool of candidates
        const year = new Date().getFullYear();
        // Use LLM-supplied extras when present; fall back to the static config
        // searchTerms only when the LLM degraded (returns no extras). Avoids the
        // redundancy of appending both lists.
        const fallbackTerms = (config.searchTerms ?? []);
        const extras = extraSearchTerms.length > 0 ? extraSearchTerms : fallbackTerms;

        const searchQueries = [
            `${genre} hits`,                       // mainstream chart entry point
            `${genre} top songs ${year}`,          // recency entry point
            ...extras,                             // 5–8 diverse LLM terms (or fallback)
        ];

        // Case-insensitive dedup — YT Music returns the same results regardless
        // of case, so "Afrobeats hits" and "afrobeats hits" must collide.
        const seen = new Set();
        const uniqueQueries = [];
        for (const q of searchQueries) {
            const key = q.toLowerCase().trim();
            if (key && !seen.has(key)) {
                seen.add(key);
                uniqueQueries.push(q);
            }
        }
        const limitedQueries = uniqueQueries.slice(0, MAX_SCRAPE_QUERIES);

        const candidateMap = new Map();
        const deadline = Date.now() + SCRAPER_TIMEOUT_MS;

        function mergeSongs(songs) {
            for (let pos = 0; pos < songs.length; pos++) {
                const song = songs[pos];
                const key = dedupKey(song.artist, song.title);

                if (candidateMap.has(key)) {
                    const existing = candidateMap.get(key);
                    existing.playlistCount += 1;
                    existing.bestPosition = Math.min(existing.bestPosition, pos + 1);
                    existing.positions.push(pos + 1);
                    if (song.plays > existing.plays) existing.plays = song.plays;
                } else {
                    candidateMap.set(key, {
                        ...song,
                        channel: song.artist,
                        playlistCount: 1,
                        bestPosition: pos + 1,
                        positions: [pos + 1],
                        source: "youtube-music",
                    });
                }
            }
        }

        // Spin up SCRAPE_CONCURRENCY pages sharing the one context. Each worker
        // pulls queries off a shared queue until exhaustion or deadline.
        const queueCopy = limitedQueries.slice();
        const workerCount = Math.min(SCRAPE_CONCURRENCY, queueCopy.length);
        let completed = 0;

        async function worker(workerIdx) {
            // Reuse the original page for worker 0 so we don't spawn an extra tab.
            const wPage = workerIdx === 0 ? page : await context.newPage();
            try {
                while (queueCopy.length > 0) {
                    if (Date.now() > deadline) {
                        log.warn(`Scraper budget exceeded mid-flight; returning partial results`);
                        break;
                    }
                    const query = queueCopy.shift();
                    const idx = ++completed;
                    log.info(`Search ${idx}/${limitedQueries.length}: "${query}"`);
                    const songs = await scrapeYTMusicSearch(wPage, query);
                    mergeSongs(songs);
                }
            } finally {
                if (workerIdx !== 0) await wPage.close().catch(() => {});
            }
        }

        await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i)));

        await browser.close();

        // Calculate avg position and clean up
        const candidates = Array.from(candidateMap.values()).map((c) => {
            c.avgPosition =
                c.positions.reduce((a, b) => a + b, 0) / c.positions.length;
            delete c.positions;
            return c;
        });

        log.success(
            `Collected ${candidates.length} unique candidates from ${limitedQueries.length} searches`
        );

        return candidates;
    } catch (err) {
        await browser.close();
        throw err;
    }
}

/**
 * Collect candidates for a specific artist.
 * Searches YouTube Music for the artist's top/best songs.
 */
async function collectArtistCandidates(artist) {
    log.header(`Collecting top songs for: ${artist}`);

    const browser = await chromium.launch({ headless: true });
    const context = await newScrapingContext(browser);
    const page = await context.newPage();

    try {
        const searchQueries = [
            `${artist} best songs`,
            `${artist} top hits`,
            `${artist} popular songs`,
        ];

        const candidateMap = new Map();
        const deadline = Date.now() + SCRAPER_TIMEOUT_MS;
        const artistLower = artist.toLowerCase();

        function mergeArtistSongs(songs) {
            const artistSongs = songs.filter((s) =>
                s.artist.toLowerCase().includes(artistLower) ||
                artistLower.includes(s.artist.toLowerCase())
            );

            for (let pos = 0; pos < artistSongs.length; pos++) {
                const song = artistSongs[pos];
                const key = dedupKey(song.artist, song.title);

                if (candidateMap.has(key)) {
                    const existing = candidateMap.get(key);
                    existing.playlistCount += 1;
                    existing.bestPosition = Math.min(existing.bestPosition, pos + 1);
                    existing.positions.push(pos + 1);
                    if (song.plays > existing.plays) existing.plays = song.plays;
                } else {
                    candidateMap.set(key, {
                        ...song,
                        channel: song.artist,
                        playlistCount: 1,
                        bestPosition: pos + 1,
                        positions: [pos + 1],
                        source: "youtube-music",
                    });
                }
            }
        }

        const queueCopy = searchQueries.slice();
        const workerCount = Math.min(SCRAPE_CONCURRENCY, queueCopy.length);
        let completed = 0;

        async function worker(workerIdx) {
            const wPage = workerIdx === 0 ? page : await context.newPage();
            try {
                while (queueCopy.length > 0) {
                    if (Date.now() > deadline) {
                        log.warn(`Scraper budget exceeded mid-flight; returning partial results`);
                        break;
                    }
                    const query = queueCopy.shift();
                    const idx = ++completed;
                    log.info(`Search ${idx}/${searchQueries.length}: "${query}"`);
                    const songs = await scrapeYTMusicSearch(wPage, query);
                    mergeArtistSongs(songs);
                }
            } finally {
                if (workerIdx !== 0) await wPage.close().catch(() => {});
            }
        }

        await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i)));

        await browser.close();

        const candidates = Array.from(candidateMap.values()).map((c) => {
            c.avgPosition =
                c.positions.reduce((a, b) => a + b, 0) / c.positions.length;
            delete c.positions;
            return c;
        });

        log.success(`Collected ${candidates.length} unique songs by ${artist}`);
        return candidates;
    } catch (err) {
        await browser.close();
        throw err;
    }
}

module.exports = { collectCandidates, collectArtistCandidates, scrapeYTMusicSearch };
