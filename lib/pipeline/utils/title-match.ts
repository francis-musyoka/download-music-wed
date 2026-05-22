import type { Track } from "../../types.ts";

/**
 * Lowercase, strip diacritics, strip non-alphanumeric punctuation, collapse
 * whitespace. Used for substring matching where presentation variants
 * (caps, accents, "Title!", "Title.") should all match.
 */
export function normaliseForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Levenshtein edit distance. Iterative two-row implementation — O(n*m) time,
 * O(min(n,m)) space. Used by the fuzzy fallback in findBestTitleMatch so that
 * a user-typed "Helo" can still pin "Hello".
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * True if `needle` appears in `haystack` with up to `threshold` character edits.
 * First tries exact substring; if that fails, slides a window of needle length
 * across haystack and checks Levenshtein against each window. Also compares
 * whole strings when lengths are close.
 */
export function fuzzyContains(
  needle: string,
  haystack: string,
  threshold: number,
): boolean {
  if (!needle || !haystack) return false;
  if (haystack.includes(needle)) return true;

  // Whole-string match when lengths are within threshold (catches "helo" ≈ "hello").
  if (
    Math.abs(needle.length - haystack.length) <= threshold &&
    levenshtein(needle, haystack) <= threshold
  ) {
    return true;
  }

  // Sliding window for "needle appears mistyped somewhere inside haystack".
  // Window length is needle.length ± threshold to allow insertions/deletions.
  const wLen = needle.length;
  const minLen = Math.max(1, wLen - threshold);
  const maxLen = wLen + threshold;
  for (let len = minLen; len <= maxLen && len <= haystack.length; len++) {
    for (let i = 0; i + len <= haystack.length; i++) {
      const window = haystack.substring(i, i + len);
      if (levenshtein(needle, window) <= threshold) return true;
    }
  }
  return false;
}

/**
 * Edit-distance threshold for fuzzy title matching: 25% of the query length,
 * floored to a minimum of 1 (so a 4-char query tolerates 1 typo) and capped at
 * 4 (so a long title doesn't accept too-loose matches).
 */
function fuzzyThreshold(query: string): number {
  return Math.min(4, Math.max(1, Math.ceil(query.length * 0.25)));
}

interface TrackWithArtists extends Track {
  artists?: string[];
}

function artistMatches(c: TrackWithArtists, qArtist: string): boolean {
  const artists = c.artists ?? [c.artist];
  return artists.some((a) => {
    const cA = normaliseForMatch(a || "");
    return cA !== "" && (cA.includes(qArtist) || qArtist.includes(cA));
  });
}

/**
 * Strict primary-artist match with a Levenshtein fuzzy fallback.
 *
 * Used by artist mode to keep only tracks where the PRIMARY artist
 * (artists[0]) is the searched artist. Two-pass:
 *   1. Strict substring (case/punctuation/diacritics-normalised, both
 *      directions). Catches removal typos like "Adel" → "Adele".
 *   2. Fuzzy Levenshtein fallback with the same length-aware threshold as
 *      findBestTitleMatch. Catches insertion/substitution typos like
 *      "Adell" / "Adelle" / "Burna Boi" / "popkan".
 *
 * Features (where the searched artist is in artists[1+], not artists[0])
 * are intentionally dropped — that's the design for artist mode.
 */
export function matchesPrimaryArtist(
  candidate: TrackWithArtists,
  artist: string,
): boolean {
  const aNorm = normaliseForMatch(artist);
  if (!aNorm) return false;
  const primary = normaliseForMatch(
    (candidate.artists?.[0] ?? candidate.artist) || "",
  );
  if (!primary) return false;

  // Pass 1: strict substring (both directions handle the channel-suffix case,
  // e.g. "popcaanvevo" includes "popcaan").
  if (
    primary === aNorm ||
    primary.includes(aNorm) ||
    aNorm.includes(primary)
  ) {
    return true;
  }

  // Pass 2: fuzzy fallback.
  const threshold = Math.min(4, Math.max(1, Math.ceil(aNorm.length * 0.25)));
  return fuzzyContains(aNorm, primary, threshold);
}

/**
 * Find the first candidate whose title contains the normalised query title
 * AND any artists[] entry matches the normalised query artist.
 *
 * Two-pass strategy:
 *   Pass 1 (strict) — exact substring on normalised titles. Cheap; preferred.
 *   Pass 2 (fuzzy)  — Levenshtein-tolerant fallback that catches user typos
 *                     like "Helo" → "Hello" or "Burna Boi" → "Burna Boy".
 *
 * Both passes require the artist to match — so "Hello World by Random Artist"
 * still cannot pin a query of {artist:"Adele", title:"Hello"}.
 */
export function findBestTitleMatch(
  candidates: TrackWithArtists[],
  artist: string,
  title: string,
): Track | null {
  const qTitle = normaliseForMatch(title);
  const qArtist = normaliseForMatch(artist);
  if (!qTitle || !qArtist) return null;

  // Pass 1: strict substring match.
  for (const c of candidates) {
    const cTitle = normaliseForMatch(c.title || "");
    if (cTitle.includes(qTitle) && artistMatches(c, qArtist)) return c;
  }

  // Pass 2: fuzzy fallback. Only kicks in when no exact substring matched.
  const threshold = fuzzyThreshold(qTitle);
  for (const c of candidates) {
    const cTitle = normaliseForMatch(c.title || "");
    if (fuzzyContains(qTitle, cTitle, threshold) && artistMatches(c, qArtist)) {
      return c;
    }
  }

  return null;
}
