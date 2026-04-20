"use client";

import { Dropdown } from "@/components/dropdown";

const GENRES = [
  "afrobeats",
  "amapiano",
  "hip-hop",
  "pop",
  "reggae",
  "gospel",
  "dancehall",
  "r&b",
  "classical",
  "latin",
  "reggaeton",
  "k-pop",
  "jazz",
  "electronic",
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
          value={limit}
          min={1}
          max={50}
          onChange={(e) => onLimit(parseInt(e.target.value, 10) || 1)}
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
