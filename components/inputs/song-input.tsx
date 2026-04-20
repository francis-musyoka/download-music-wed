"use client";

interface Props {
  song: string;
  onSong: (v: string) => void;
}

export function SongInput({ song, onSong }: Props) {
  return (
    <div className="console__form console__form--single" data-form="song">
      <div className="field">
        <label>Song title</label>
        <input
          type="text"
          value={song}
          placeholder="Calm Down — Rema"
          onChange={(e) => onSong(e.target.value)}
        />
      </div>
    </div>
  );
}
