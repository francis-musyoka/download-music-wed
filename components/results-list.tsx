"use client";

import type { Track, DownloadedTrack } from "@/lib/types";
import { TrackCard } from "./track-card";

type Row = Track | DownloadedTrack;

interface Props {
  tracks: Row[];
  inputLabel: string;
  onPlay: (t: Row) => void;
  onDownloadOne: (t: Row) => void;
  onDownloadAll: () => void;
  onDownloadM3U: () => void;
  zipBusy?: boolean;
}

function rowKey(t: Row, i: number): string {
  const v = (t as Track).videoId;
  if (v) return v;
  const f = (t as DownloadedTrack).fileName;
  if (f) return f;
  return String(i);
}

export function ResultsList({
  tracks,
  inputLabel,
  onPlay,
  onDownloadOne,
  onDownloadAll,
  onDownloadM3U,
  zipBusy,
}: Props) {
  if (tracks.length === 0) return null;
  return (
    <section className="chart" id="results">
      <div className="container-x">
        <div className="chart__head">
          <div>
            <span
              className="eyebrow"
              style={{ display: "block", marginBottom: 12 }}
            >
              Search results · {inputLabel} · {tracks.length} tracks
            </span>
            <h2 className="display">
              Preview and
              <br />
              <em>download.</em>
            </h2>
            <p
              style={{
                color: "var(--fg-dim)",
                fontSize: 15,
                lineHeight: 1.6,
                margin: "18px 0 0",
                maxWidth: 520,
              }}
            >
              Click <strong style={{ color: "var(--fg)" }}>▶</strong> to preview
              any track in your browser. Click{" "}
              <strong style={{ color: "var(--fg)" }}>↓</strong> to save it to
              your device. Or grab all {tracks.length} at once.
            </p>
          </div>
          <div className="chart__bulk">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onDownloadAll}
              disabled={zipBusy}
            >
              ↓ Download all (ZIP)
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onDownloadM3U}
            >
              ↓ Download playlist (M3U)
            </button>
          </div>
        </div>
        <div className="chart__list">
          {tracks.map((t, i) => (
            <TrackCard
              key={rowKey(t, i)}
              rank={i + 1}
              track={t}
              onPlay={onPlay}
              onDownload={onDownloadOne}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
