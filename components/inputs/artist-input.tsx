"use client";

import { useEffect, useState } from "react";

interface Props {
  artist: string;
  limit: number;
  name: string;
  onArtist: (v: string) => void;
  onLimit: (v: number) => void;
  onName: (v: string) => void;
}

export function ArtistInput({ artist, limit, name, onArtist, onLimit, onName }: Props) {
  const [raw, setRaw] = useState(String(limit));
  useEffect(() => { setRaw(String(limit)); }, [limit]);

  return (
    <div className="console__form" data-form="artist">
      <div className="field field--wide">
        <label>Artist</label>
        <input
          type="text"
          value={artist}
          placeholder="Burna Boy · Tems · Asake…"
          onChange={(e) => onArtist(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Limit</label>
        <input
          type="number"
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
      </div>
      <div className="field">
        <label>Playlist name</label>
        <input
          type="text"
          value={name}
          placeholder="Best of Burna Boy"
          onChange={(e) => onName(e.target.value)}
        />
      </div>
    </div>
  );
}
