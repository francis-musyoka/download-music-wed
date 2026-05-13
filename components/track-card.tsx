"use client";

import { memo } from "react";
import { Download, Pause, Play } from "lucide-react";
import type { Track, DownloadedTrack } from "@/lib/types";
import { IconActionButton } from "./ui/icon-action-button";
import { cn } from "@/lib/utils";

type Row = Track | DownloadedTrack;

interface Props {
    rank: number;
    track: Row;
    isPlaying?: boolean;
    isLoading?: boolean;
    isDownloading?: boolean;
    /** True while a bulk ZIP/M3U job is running — disables the per-track ↓ button. */
    bulkBusy?: boolean;
    onPlay: (t: Row) => void;
    onDownload: (t: Row) => void;
}

function fmtDur(sec?: number) {
    if (!sec) return "";
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export const TrackCard = memo(function TrackCard({
    rank,
    track,
    isPlaying,
    isLoading,
    isDownloading,
    bulkBusy,
    onPlay,
    onDownload,
}: Props) {
    const t = track as Track & DownloadedTrack;
    const score = typeof t.score === "number" ? t.score.toFixed(1) : null;
    const duration = fmtDur(t.duration);

    return (
        <div
            className={cn(
                "group flex flex-col gap-3 border-b border-line py-4",
                "md:grid md:grid-cols-[5rem_1fr_auto_auto_auto_auto_auto_auto] md:items-center md:gap-x-6 md:py-7",
                "transition-shadow duration-200 ease-out",
                "hover:shadow-[inset_0_0_60px_-20px_rgba(255,90,31,0.25)]",
            )}
        >
            <div className="flex items-start gap-4 md:contents">
                <div
                    className={cn(
                        "shrink-0 font-display leading-none tracking-tighter",
                        "text-4xl md:text-7xl",
                        "origin-left transition-all duration-200 ease-out",
                        "group-hover:scale-110 group-hover:text-accent",
                        isPlaying ? "text-accent" : "text-fg-dim",
                    )}
                    style={{ fontVariationSettings: '"SOFT" 40, "WONK" 1, "opsz" 144' }}
                >
                    {String(rank).padStart(2, "0")}
                </div>
                <div className="min-w-0 flex-1">
                    <h3
                        className="m-0 font-display text-base font-medium leading-tight tracking-tight md:text-xl"
                        style={{ fontVariationSettings: '"SOFT" 50, "WONK" 0, "opsz" 72' }}
                    >
                        {t.title}
                    </h3>
                    <div className="mt-1 text-sm text-fg-dim">{t.artist}</div>
                </div>
            </div>

            <div className="flex items-center justify-between gap-3 md:contents">
                {duration ? (
                    <span className="min-w-12 font-mono text-xs tracking-widest text-fg-dim md:text-sm">
                        {duration}
                    </span>
                ) : (
                    <span aria-hidden className="min-w-12" />
                )}
                {score ? (
                    <span className="bg-accent-2 px-2 py-0.5 font-mono text-xs font-semibold text-bg">
                        {score}
                    </span>
                ) : (
                    <span
                        aria-hidden
                        className="invisible bg-accent-2 px-2 py-0.5 font-mono text-xs font-semibold text-bg"
                    />
                )}
                <div className="flex items-center gap-2 md:contents">
                    <IconActionButton
                        variant="primary"
                        active={isPlaying}
                        loading={isLoading}
                        onClick={() => onPlay(track)}
                        aria-label={
                            isLoading
                                ? `Loading ${t.title}`
                                : isPlaying
                                    ? `Pause ${t.title}`
                                    : `Play ${t.title}`
                        }
                    >
                        {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
                    </IconActionButton>
                    <IconActionButton
                        loading={isDownloading}
                        disabled={bulkBusy || isDownloading}
                        onClick={() => onDownload(track)}
                        aria-label={isDownloading ? `Downloading ${t.title}` : `Download ${t.title}`}
                    >
                        <Download />
                    </IconActionButton>
                    {/* <IconActionButton aria-label={`Favorite ${t.title}`}>
                        <Heart />
                    </IconActionButton>
                    <IconActionButton aria-label={`Remove ${t.title}`}>
                        <X />
                    </IconActionButton> */}
                </div>
            </div>
        </div>
    );
});
