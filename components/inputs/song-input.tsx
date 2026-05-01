"use client";

interface Props {
  title: string;
  artist: string;
  onTitle: (v: string) => void;
  onArtist: (v: string) => void;
}

export function SongInput({ title, artist, onTitle, onArtist }: Props) {
  return (
    <div className="console__form" data-form="song">
      <div className="field field--wide">
        <label>Song title</label>
        <input
          type="text"
          value={title}
          placeholder="Essence"
          onChange={(e) => onTitle(e.target.value)}
        />
      </div>
      <div className="field field--wide">
        <label>Artist</label>
        <input
          type="text"
          value={artist}
          placeholder="Wizkid"
          onChange={(e) => onArtist(e.target.value)}
        />
      </div>
    </div>
  );
}
