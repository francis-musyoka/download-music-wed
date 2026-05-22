/**
 * Curated genre list — verified 2026-05-22 via /tmp/genre-test-results.md.
 * Each entry returned a top-30 by hit-score that was clearly on-genre after
 * the noise filter + log10(views) sort. Niche / regional terms like
 * "gengetone", "bongo flava", "lingala", "mugithi", "highlife", "indie",
 * "punk" are excluded because ytmusicapi pads their tails with global pop
 * hits whose billion+ views dominate the ranking. Users seeking those
 * should switch to Artist mode.
 *
 * Single source of truth for:
 * - components/inputs/genre-input.tsx — populates the <select> options
 * - lib/pipeline/orchestrator.ts      — skips LLM rerank (already on-genre)
 * - app/api/rank/route.ts             — skips expensive-quota peek
 */
export const CURATED_GENRES = [
    "Afro House",
    "Afrobeats",
    "Amapiano",
    "Bachata",
    "Blues",
    "Chillhop",
    "Classical",
    "Contemporary Gospel",
    "Country",
    "Dancehall",
    "Disco",
    "Dubstep",
    "EDM",
    "Funk",
    "Gospel",
    "Hip-Hop",
    "Jazz",
    "K-Pop",
    "Latin",
    "Metal",
    "Pop",
    "R&B",
    "Rap",
    "Reggae",
    "Reggaeton",
    "Rock",
    "Salsa",
    "Soca",
    "Trap",
    "Worship",
] as const;

const CURATED_LC = new Set(CURATED_GENRES.map((g) => g.toLowerCase()));

/**
 * Case-insensitive membership check. `input` is trimmed; non-curated free
 * text (e.g., user-typed legacy values from older sessions) returns false.
 */
export function isCuratedGenre(input: string): boolean {
    return CURATED_LC.has(input.trim().toLowerCase());
}
