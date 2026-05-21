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

interface TrackWithArtists extends Track {
  artists?: string[];
}

/**
 * Find the first candidate whose title contains the normalised query title
 * AND any artists[] entry contains the normalised query artist (or vice versa).
 * Conservative — both conditions must match, so "Hello World by Random Artist"
 * does NOT match a query of {artist:"Adele", title:"Hello"}.
 */
export function findBestTitleMatch(
  candidates: TrackWithArtists[],
  artist: string,
  title: string,
): Track | null {
  const qTitle = normaliseForMatch(title);
  const qArtist = normaliseForMatch(artist);
  if (!qTitle || !qArtist) return null;

  for (const c of candidates) {
    const cTitle = normaliseForMatch(c.title || "");
    if (!cTitle.includes(qTitle)) continue;

    const artists = c.artists ?? [c.artist];
    const artistMatch = artists.some((a) => {
      const cA = normaliseForMatch(a || "");
      return cA && (cA.includes(qArtist) || qArtist.includes(cA));
    });
    if (artistMatch) return c;
  }
  return null;
}
