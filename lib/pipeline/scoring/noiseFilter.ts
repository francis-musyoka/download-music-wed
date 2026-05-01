import type { Track } from "../../types.ts";

const BAD_TITLE_RE =
  /\b(type beat|instrumental|official mix|compilation|mashup|karaoke|reaction|sped[ -]?up|slowed|reversed)\b/i;

// ≥3 separators AND contains underscore. Real artist strings almost never
// have both. Conservative: prefer under-filtering (let LLM rerank catch the
// rest) over dropping legitimate tracks with comma-separated collaborators.
const SUSPICIOUS_ARTIST_RE = /([,&].*){3,}.*_/;

const MAX_GENRE_ARTIST_DURATION = 360; // 6 min

export function applyNoiseFilter(
  candidates: Track[],
  mode: "genre" | "artist" | "song",
): Track[] {
  return candidates.filter((c) => {
    if (BAD_TITLE_RE.test(c.title)) return false;
    if (SUSPICIOUS_ARTIST_RE.test(c.artist)) return false;
    if (mode !== "song" && c.duration && c.duration > MAX_GENRE_ARTIST_DURATION) return false;
    return true;
  });
}
