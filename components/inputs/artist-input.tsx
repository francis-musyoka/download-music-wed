"use client";

interface Props {
  artist: string;
  limit: number;
  name: string;
  onArtist: (v: string) => void;
  onLimit: (v: number) => void;
  onName: (v: string) => void;
}

export function ArtistInput({ artist, limit, name, onArtist, onLimit, onName }: Props) {
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
          value={limit}
          min={1}
          max={20}
          onChange={(e) => onLimit(parseInt(e.target.value, 10) || 1)}
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
