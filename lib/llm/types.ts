import type { Mode } from "../types.ts";

export type UnderstandMode = Extract<Mode, "genre" | "artist" | "song">;

export interface UnderstoodGenre {
    mode: "genre";
    canonicalGenre: string;
    displayName: string;
    knownGenre: boolean;
    spellCorrected: boolean;
    originalInput: string;
    searchTerms: string[];
    rejectReason?: string;
}

export interface UnderstoodArtist {
    mode: "artist";
    canonicalArtist: string;
    spellCorrected: boolean;
    originalInput: string;
    disambiguationNote?: string;
    rejectReason?: string;
}

export interface UnderstoodSong {
    mode: "song";
    canonicalTitle: string;
    canonicalArtist: string;
    spellCorrectedTitle: boolean;
    spellCorrectedArtist: boolean;
    originalTitle: string;
    originalArtist: string;
    rejectReason?: string;
}

export type UnderstoodQuery = UnderstoodGenre | UnderstoodArtist | UnderstoodSong;

export type RejectCategory =
    | "wrong-genre"
    | "wrong-artist"
    | "mix-or-compilation"
    | "cover"
    | "live-or-acoustic"
    | "remix"
    | "low-quality-upload";

export interface RerankDecision {
    id: string;
    keep: boolean;
    rejectCategory?: RejectCategory;
}

export interface RerankResult {
    results: RerankDecision[];
}

export interface RerankCandidate {
    id: string;
    title: string;
    artist: string;
}
