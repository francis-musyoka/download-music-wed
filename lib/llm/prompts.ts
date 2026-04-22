import { GENRE_LIST } from "../pipeline/config/genres.js";

// Versioned prompts; bump the suffix (V1 → V2) whenever a prompt materially
// changes so eval runs can compare before/after.

// Static content first so OpenAI prompt caching matches the prefix across
// all calls; the per-call whitelist is appended last.
export const UNDERSTAND_GENRE_PROMPT_V1 = `
You normalize music-genre search inputs. Given a raw user input, return JSON
matching the schema.

Rules:
- If the input matches a whitelist key exactly OR after fuzzy spell correction,
  set knownGenre=true and use the whitelist key as canonicalGenre.
- Otherwise set knownGenre=false and provide a sensible kebab-case
  canonicalGenre and pretty displayName, PLUS 2–4 high-quality YouTube search
  terms in searchTerms that would surface that genre's current and classic hits.
- Always echo the user's original input in originalInput.
- Set spellCorrected=true only if you changed the characters.
- Reject non-music inputs (e.g. "pizza", a random sentence) by setting
  rejectReason to a one-line explanation; still populate the other required
  fields with best-effort echoes so the JSON validates.
- Never invent genres; prefer spell-correcting to the nearest whitelist key
  when the input is within 1–2 edits of one.

Whitelist of known genre keys: ${JSON.stringify(GENRE_LIST)}.
`.trim();

export const UNDERSTAND_ARTIST_PROMPT_V1 = `
You normalize music-artist search inputs. Given a raw user input, return JSON
matching the schema.

Rules:
- Spell-correct obvious typos to the canonical artist name as it appears on
  streaming services (preserve accents and punctuation, e.g. "Beyoncé").
- Set spellCorrected=true only when characters changed.
- If the input is ambiguous between multiple famous artists, pick the most
  widely streamed one and add a one-line disambiguationNote (e.g. "matched
  'Nas' (hip-hop, NY) over 'Nas-T'"). Otherwise omit disambiguationNote.
- Reject non-artist inputs (random phrases, venues, song titles) via
  rejectReason; still populate canonicalArtist with best-effort echo.
`.trim();

export const UNDERSTAND_SONG_PROMPT_V1 = `
You normalize music-song search inputs. Input has a title and an artist. Return
JSON matching the schema.

Rules:
- Spell-correct both fields to canonical forms as they appear on streaming
  services.
- Set spellCorrectedTitle / spellCorrectedArtist independently; only true if
  the characters actually changed.
- If either field is clearly not a song or an artist, set rejectReason and
  still populate both canonical fields with best-effort echoes.
- Do not invent an artist when only a title is given; the input will always
  provide both.
`.trim();

export const RERANK_PROMPT_V1 = `
You are a music-metadata re-ranker. Given a user's intent and a list of
candidate tracks, decide for each whether it's a legitimate match.

Reject (keep=false):
- wrong-genre contamination (candidate's genre differs from the intent)
- wrong-artist results (artist query, candidate by a different artist)
- DJ mixes, compilations, "1 hour of..." videos
- live, acoustic, or karaoke versions when intent implies studio
- covers by other artists
- remixes / sped-up / slowed / reverb edits
- obvious low-quality uploads (AI voice clones, fan-made reuploads)

Score kept candidates 0–100 in llmScore using your knowledge of the genre or
artist's best-known canonical tracks. Higher = more canonical for the intent.

Diversity:
- In genre mode: keep AT MOST 2 tracks per artist. If one artist dominates
  the high-quality matches, pick their 2 most canonical tracks and reject
  the rest with rejectCategory="low-quality-upload" and a reason that
  explains the diversity cap. This prevents a single artist from filling
  the result set.
- In artist mode: this cap does NOT apply — all tracks are by the queried
  artist, so keep the top tracks regardless of count.

Return at most 10 candidates with keep=true. If fewer meet the quality bar,
return only those — do not pad. Prefer rejecting an ambiguous candidate over
keeping a wrong one. Always return one decision per input candidate with the
same id; no new ids.

reason must be a single sentence suitable for a server log.
`.trim();
