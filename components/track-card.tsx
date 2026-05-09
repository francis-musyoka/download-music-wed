"use client";

import { memo } from "react";
import type { Track, DownloadedTrack } from "@/lib/types";

type Row = Track | DownloadedTrack;

interface Props {
  rank: number;
  track: Row;
  isPlaying?: boolean;
  isLoading?: boolean;
  isDownloading?: boolean;
  onPlay: (t: Row) => void;
  onDownload: (t: Row) => void;
}

function fmtDur(sec?: number) {

  if (!sec) return "";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function fmtViews(n?: number) {
  if (!n) return "";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B plays";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M plays";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K plays";
  return String(n) + " plays";
}

export const TrackCard = memo(function TrackCard({
  rank,
  track,
  isPlaying,
  isLoading,
  isDownloading,
  onPlay,
  onDownload,
}: Props) {
  const t = track as Track & DownloadedTrack;
  const plays = fmtViews(t.views ?? (t as Track).plays);
  const score = typeof t.score === "number" ? t.score.toFixed(1) : null;

  return (
    <div className="chart__row">
      <div className="chart__rank">{String(rank).padStart(2, "0")}</div>
      <div className="chart__thumb" />
      <div className="chart__info">
        <h3>{t.title}</h3>
        <div className="artist">{t.artist}</div>
      </div>
      <div className="chart__meta">
        {t.duration && <span>{fmtDur(t.duration)}</span>}
        {plays && <span>{plays}</span>}
        {score && <span className="score">{score}</span>}
      </div>
      <div className="chart__actions">
        <button
          type="button"
          className={`icon-btn primary${isPlaying ? " playing" : ""}${isLoading ? " loading" : ""}`}
          onClick={() => onPlay(track)}
          disabled={isLoading}
          aria-label={
            isLoading
              ? `Loading ${t.title}`
              : isPlaying
                ? `Pause ${t.title}`
                : `Play ${t.title}`
          }
          aria-busy={isLoading}
        >
          <span className={isLoading ? "icon-btn__spin" : undefined} aria-hidden>
            {isLoading ? "◐" : isPlaying ? "⏸" : "▶"}
          </span>
        </button>
        <button
          type="button"
          className={`icon-btn${isDownloading ? " loading" : ""}`}
          onClick={() => onDownload(track)}
          disabled={isDownloading}
          aria-label={
            isDownloading ? `Downloading ${t.title}` : `Download ${t.title}`
          }
          aria-busy={isDownloading}
        >
          <span className={isDownloading ? "icon-btn__spin" : undefined} aria-hidden>
            {isDownloading ? "◐" : "↓"}
          </span>
        </button>
      </div>
    </div>
  );
});
