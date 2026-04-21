"use client";

interface Props {
  url: string;
  name: string;
  onUrl: (v: string) => void;
  onName: (v: string) => void;
}

export function UrlInput({ url, name, onUrl, onName }: Props) {
  return (
    <div className="console__form" data-form="url">
      <div className="field field--wide">
        <label>URL</label>
        <input
          type="text"
          value={url}
          placeholder="https://youtube.com/watch?v=… · open.spotify.com/… · soundcloud.com/…"
          onChange={(e) => onUrl(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Playlist name</label>
        <input
          type="text"
          value={name}
          placeholder="My Playlist"
          onChange={(e) => onName(e.target.value)}
        />
      </div>
    </div>
  );
}
