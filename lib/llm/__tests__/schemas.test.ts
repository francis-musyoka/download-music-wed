import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UnderstoodGenreSchema,
  UnderstoodArtistSchema,
  UnderstoodSongSchema,
  RerankResultSchema,
} from "../schemas.ts";

test("UnderstoodGenreSchema parses a minimal known-genre response", () => {
  const parsed = UnderstoodGenreSchema.parse({
    canonicalGenre: "dancehall",
    displayName: "Dancehall",
    knownGenre: true,
    spellCorrected: false,
    originalInput: "dancehall",
    searchTerms: ["dancehall hits"],
  });
  assert.equal(parsed.canonicalGenre, "dancehall");
  assert.equal(parsed.knownGenre, true);
});

test("UnderstoodGenreSchema parses an off-list genre with searchTerms", () => {
  const parsed = UnderstoodGenreSchema.parse({
    canonicalGenre: "afro-house",
    displayName: "Afro House",
    knownGenre: false,
    spellCorrected: false,
    originalInput: "afro-house",
    searchTerms: ["afro house hits", "Black Coffee"],
  });
  assert.equal(parsed.knownGenre, false);
  assert.equal(parsed.searchTerms.length, 2);
});

test("UnderstoodGenreSchema parses a rejected non-music input", () => {
  const parsed = UnderstoodGenreSchema.parse({
    canonicalGenre: "pizza",
    displayName: "Pizza",
    knownGenre: false,
    spellCorrected: false,
    originalInput: "pizza",
    searchTerms: [],
    rejectReason: "not a music genre",
  });
  assert.equal(parsed.rejectReason, "not a music genre");
});

test("UnderstoodArtistSchema round-trips a spell-corrected artist", () => {
  const parsed = UnderstoodArtistSchema.parse({
    canonicalArtist: "Beyoncé",
    spellCorrected: true,
    originalInput: "beyonse",
  });
  assert.equal(parsed.canonicalArtist, "Beyoncé");
  assert.equal(parsed.spellCorrected, true);
});

test("UnderstoodSongSchema round-trips a spell-corrected song", () => {
  const parsed = UnderstoodSongSchema.parse({
    canonicalTitle: "Essence",
    canonicalArtist: "Wizkid",
    spellCorrectedTitle: true,
    spellCorrectedArtist: true,
    originalTitle: "essense",
    originalArtist: "wizkd",
  });
  assert.equal(parsed.canonicalTitle, "Essence");
});

test("RerankResultSchema rejects an empty id", () => {
  assert.throws(() =>
    RerankResultSchema.parse({
      results: [{ id: "", keep: true }],
    }),
  );
});

test("RerankResultSchema parses a keep/drop pair", () => {
  const parsed = RerankResultSchema.parse({
    results: [
      { id: "v1", keep: true },
      { id: "v2", keep: false, rejectCategory: "wrong-genre" },
    ],
  });
  assert.equal(parsed.results.length, 2);
  assert.equal(parsed.results[1].rejectCategory, "wrong-genre");
});
