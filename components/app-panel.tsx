"use client";

import { useCallback, useState } from "react";
import type { Mode } from "@/lib/types";
import { StepsInline } from "./steps-inline";
import { GenreInput } from "./inputs/genre-input";
import { ArtistInput } from "./inputs/artist-input";
import { SongInput } from "./inputs/song-input";
import { UrlInput } from "./inputs/url-input";

const BUTTON_LABELS: Record<Mode, string> = {
  genre: "Search top tracks",
  artist: "Search top tracks",
  song: "Search this song",
  url: "Download now",
};

const MODES: Mode[] = ["genre", "artist", "song", "url"];

export interface StatusLine {
  text: string;
  state: "done" | "current" | "pending";
}

interface Props {
  onSubmit: (p: {
    mode: Mode;
    input: string | { title: string; artist: string };
    limit?: number;
    name?: string;
  }) => void;
  statusLines?: StatusLine[];
  busy?: boolean;
}

export function AppPanel({ onSubmit, statusLines = [], busy }: Props) {
  const [mode, setMode] = useState<Mode>("genre");
  const [genre, setGenre] = useState("afrobeats");
  const [genreLimit, setGenreLimit] = useState(10);
  const [genreName, setGenreName] = useState("");
  const [artist, setArtist] = useState("");
  const [artistLimit, setArtistLimit] = useState(5);
  const [artistName, setArtistName] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState("");
  const [url, setUrl] = useState("");
  const [urlName, setUrlName] = useState("");

  const handleGo = useCallback(() => {
    if (busy) return;
    if (mode === "genre") {
      onSubmit({
        mode,
        input: genre,
        limit: genreLimit,
        name: genreName || `${genre} Hits`,
      });
    } else if (mode === "artist") {
      onSubmit({
        mode,
        input: artist,
        limit: artistLimit,
        name: artistName || `Best of ${artist}`,
      });
    } else if (mode === "song") {
      if (!songTitle.trim() || !songArtist.trim()) return;
      onSubmit({
        mode,
        input: { title: songTitle.trim(), artist: songArtist.trim() },
      });
    } else {
      onSubmit({ mode, input: url, name: urlName || "My Playlist" });
    }
  }, [
    busy,
    mode,
    onSubmit,
    genre,
    genreLimit,
    genreName,
    artist,
    artistLimit,
    artistName,
    songTitle,
    songArtist,
    url,
    urlName,
  ]);

  return (
    <section className="app" id="app">
      <div className="container-x">
        <div className="app__head">
          <h2 className="display">
            Find your
            <br />
            <em>music.</em>
          </h2>
          <StepsInline />
        </div>
        <div className="console">
          <div className="console__bar">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                className={`console__tab${mode === m ? " active" : ""}`}
                onClick={() => setMode(m)}
              >
                ./{m.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="console__body">
            {mode === "genre" && (
              <GenreInput
                genre={genre}
                limit={genreLimit}
                name={genreName}
                onGenre={setGenre}
                onLimit={setGenreLimit}
                onName={setGenreName}
              />
            )}
            {mode === "artist" && (
              <ArtistInput
                artist={artist}
                limit={artistLimit}
                name={artistName}
                onArtist={setArtist}
                onLimit={setArtistLimit}
                onName={setArtistName}
              />
            )}
            {mode === "song" && (
              <SongInput
                title={songTitle}
                artist={songArtist}
                onTitle={setSongTitle}
                onArtist={setSongArtist}
              />
            )}
            {mode === "url" && (
              <UrlInput
                url={url}
                name={urlName}
                onUrl={setUrl}
                onName={setUrlName}
              />
            )}
            <div className="console__action">
              <button
                id="queue-btn"
                type="button"
                className="btn btn-accent"
                onClick={handleGo}
                disabled={busy}
                aria-busy={busy || undefined}
              >
                {busy ? (
                  <>
                    Searching… <span className="spinner" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    {BUTTON_LABELS[mode]} <span>→</span>
                  </>
                )}
              </button>
            </div>
          </div>
          {statusLines.length > 0 && (
            <div className="status active">
              {statusLines.map((l, i) => (
                <div
                  key={i}
                  className={`status__line${l.state === "current" ? " current" : ""}`}
                >
                  <span className={l.state === "pending" ? "pending" : "tick"}>
                    {l.state === "done" ? "✓" : l.state === "current" ? "▸" : "○"}
                  </span>{" "}
                  {l.text}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
