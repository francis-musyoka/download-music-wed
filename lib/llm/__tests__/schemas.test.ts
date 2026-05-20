import { test, expect } from "vitest";
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
    expect(parsed.canonicalGenre).toBe("dancehall");
    expect(parsed.knownGenre).toBe(true);
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
    expect(parsed.knownGenre).toBe(false);
    expect(parsed.searchTerms.length).toBe(2);
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
    expect(parsed.rejectReason).toBe("not a music genre");
});

test("UnderstoodArtistSchema round-trips a spell-corrected artist", () => {
    const parsed = UnderstoodArtistSchema.parse({
        canonicalArtist: "Beyoncé",
        spellCorrected: true,
        originalInput: "beyonse",
    });
    expect(parsed.canonicalArtist).toBe("Beyoncé");
    expect(parsed.spellCorrected).toBe(true);
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
    expect(parsed.canonicalTitle).toBe("Essence");
});

test("RerankResultSchema rejects an empty id", () => {
    expect(() =>
        RerankResultSchema.parse({
            results: [{ id: "", keep: true }],
        }),
    ).toThrow();
});

test("RerankResultSchema parses a keep/drop pair", () => {
    const parsed = RerankResultSchema.parse({
        results: [
            { id: "v1", keep: true },
            { id: "v2", keep: false, rejectCategory: "wrong-genre" },
        ],
    });
    expect(parsed.results.length).toBe(2);
    expect(parsed.results[1].rejectCategory).toBe("wrong-genre");
});
