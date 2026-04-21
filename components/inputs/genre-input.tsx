"use client";

import { useEffect, useState } from "react";
import { Dropdown } from "@/components/dropdown";

const GENRES = [
  "afrobeats", "amapiano", "hip-hop", "pop", "reggae", "gospel",
  "dancehall", "r&b", "classical", "latin", "reggaeton", "k-pop",
  "jazz", "electronic",
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
    <div className="console__form" data-form="genre">
      <div className="field">
        <label htmlFor="genre-trigger">Genre</label>
        <Dropdown
          id="genre-trigger"
          label="Genre"
          value={genre}
          options={GENRES}
          onChange={onGenre}
        />
      </div>
      <div className="field">
        <label>Limit</label>
        <input
          type="number"
          value={raw}
          min={1}
          max={20}
          onChange={(e) => {
            const v = e.target.value;
            setRaw(v);
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n >= 1 && n <= 20) onLimit(n);
          }}
          onBlur={(e) => {
            // Read from DOM, not React state — the blur event can fire
            // before React has committed the latest onChange update.
            const n = parseInt(e.target.value, 10);
            const clamped = Number.isFinite(n) ? Math.min(20, Math.max(1, n)) : 1;
            setRaw(String(clamped));
            onLimit(clamped);
          }}
        />
      </div>
      <div className="field">
        <label>Playlist name</label>
        <input
          type="text"
          value={name}
          placeholder="Afrobeats 2026"
          onChange={(e) => onName(e.target.value)}
        />
      </div>
    </div>
  );
}
