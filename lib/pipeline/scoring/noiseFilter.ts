import type { Track } from "../../types.ts";

// Title patterns that almost always indicate a non-studio or non-song upload.
// Built as one combined regex for speed; case-insensitive.
const NOISE_TITLE_RE = new RegExp(
  [
    // Mixes / compilations
    "\\bmix\\b", "\\bmegamix\\b", "\\bnonstop\\b", "\\bcompilation\\b",
    "\\bvol\\.?\\s*\\d", "\\bvolume\\s*\\d", "\\bbest\\s+of\\b",
    "\\btop\\s*\\d+\\b", "\\b\\d+\\s*hour", "\\b\\d+\\s*min\\b",
    // Not the studio version
    "\\blive\\s+(at|in|from)\\b", "\\(live\\)", "\\bacoustic\\b",
    "\\bunplugged\\b", "\\bkaraoke\\b", "\\binstrumental\\b",
    "\\btype\\s+beat\\b",
    // Edits / remixes
    "\\bremix\\b", "\\bsped[ -]?up\\b", "\\bspeed[ -]?up\\b",
    "\\bslowed\\b", "\\bnightcore\\b", "\\bmashup\\b", "\\breversed\\b",
    "\\breverb\\b",
    // Not music
    "\\breaction\\b", "\\breacts\\s+to\\b", "\\btutorial\\b",
    "\\bhow\\s+to\\s+play\\b", "\\bmaking\\s+of\\b",
    "\\bbehind\\s+the\\s+scenes\\b", "\\binterview\\b",
  ].join("|"),
  "i",
);

// Conservative artist-string heuristic kept from the previous filter.
// Real artist strings rarely have ≥3 separators AND an underscore.
const SUSPICIOUS_ARTIST_RE = /([,&].*){3,}.*_/;

const MIN_DURATION_SEC = 120;  // < 2 min: snippets, intros
const MAX_DURATION_SEC = 480;  // > 8 min: mixes, long-form non-hits
                               // (Amapiano legitimately reaches 7-8; cutoff at 8
                               // accepts the long tail and lets LLM catch mixes.)

export function applyNoiseFilter(
  candidates: Track[],
  mode: "genre" | "artist" | "song",
): Track[] {
  return candidates.filter((c) => {
    if (NOISE_TITLE_RE.test(c.title)) return false;
    if (SUSPICIOUS_ARTIST_RE.test(c.artist)) return false;
    if (mode !== "song" && c.duration) {
      if (c.duration > MAX_DURATION_SEC) return false;
      if (c.duration < MIN_DURATION_SEC) return false;
    }
    return true;
  });
}
