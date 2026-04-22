import { z } from "zod";

// Schemas must exactly mirror lib/llm/types.ts shapes. The OpenAI SDK helper
// zodResponseFormat() converts these to JSON Schema and enforces them on the
// model response — we then .parse() again defensively.

export const UnderstoodGenreSchema = z.object({
  canonicalGenre: z.string().min(1),
  displayName: z.string().min(1),
  knownGenre: z.boolean(),
  spellCorrected: z.boolean(),
  originalInput: z.string(),
  searchTerms: z.array(z.string().min(1)).min(0).max(6),
  rejectReason: z.string().optional(),
});

export const UnderstoodArtistSchema = z.object({
  canonicalArtist: z.string().min(1),
  spellCorrected: z.boolean(),
  originalInput: z.string(),
  disambiguationNote: z.string().optional(),
  rejectReason: z.string().optional(),
});

export const UnderstoodSongSchema = z.object({
  canonicalTitle: z.string().min(1),
  canonicalArtist: z.string().min(1),
  spellCorrectedTitle: z.boolean(),
  spellCorrectedArtist: z.boolean(),
  originalTitle: z.string(),
  originalArtist: z.string(),
  rejectReason: z.string().optional(),
});

export const RejectCategorySchema = z.enum([
  "wrong-genre",
  "wrong-artist",
  "mix-or-compilation",
  "cover",
  "live-or-acoustic",
  "remix",
  "low-quality-upload",
]);

export const RerankDecisionSchema = z.object({
  id: z.string().min(1),
  keep: z.boolean(),
  llmScore: z.number().min(0).max(100),
  rejectCategory: RejectCategorySchema.optional(),
  reason: z.string(),
});

export const RerankResultSchema = z.object({
  results: z.array(RerankDecisionSchema),
});
