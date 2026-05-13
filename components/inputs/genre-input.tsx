"use client";

import { useEffect, useState } from "react";
import { TextInput } from "@/components/ui/text-input";

// Suggestions for the autocomplete datalist. Mirrors the keys in
// lib/pipeline/config/genres.js. Users are NOT limited to this list — the
// LLM understand step canonicalizes whatever they type and generates search
// terms for unknown genres.
const GENRE_SUGGESTIONS = [
    "afrobeats", "amapiano", "bongo-flava", "classical", "country",
    "dancehall", "drill", "electronic", "gengetone", "gospel", "hip-hop",
    "indie", "jazz", "k-pop", "latin", "pop", "r&b", "reggae", "reggaeton",
    "rock",
];

interface Props {
    genre: string;
    limit: number;
    name: string;
    onGenre: (v: string) => void;
    onLimit: (v: number) => void;
    onName: (v: string) => void;
}

export function GenreInput({ genre, limit, name, onGenre, onLimit, onName }: Props) {
    const [raw, setRaw] = useState(String(limit));
    useEffect(() => { setRaw(String(limit)); }, [limit]);

    return (
        <div className="flex flex-col gap-6">
            <TextInput
                label="Genre"
                value={genre}
                list="genre-suggestions"
                autoComplete="off"
                spellCheck={false}
                placeholder="afrobeats, bongo rb, trap soul…"
                onChange={(e) => onGenre(e.target.value)}
                onBlur={(e) => onGenre(e.target.value.trim().toLowerCase())}
            />
            <datalist id="genre-suggestions">
                {GENRE_SUGGESTIONS.map((g) => (
                    <option key={g} value={g} />
                ))}
            </datalist>
            <TextInput
                label="Limit"
                inputType="number"
                value={raw}
                min={1}
                max={10}
                onChange={(e) => {
                    const v = e.target.value;
                    setRaw(v);
                    const n = parseInt(v, 10);
                    if (Number.isFinite(n) && n >= 1 && n <= 10) onLimit(n);
                }}
                onBlur={(e) => {
                    const n = parseInt(e.target.value, 10);
                    const clamped = Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 1;
                    setRaw(String(clamped));
                    onLimit(clamped);
                }}
            />
            <TextInput
                label="Playlist name"
                value={name}
                placeholder="Afrobeats 1026"
                onChange={(e) => onName(e.target.value)}
            />
        </div>
    );
}
