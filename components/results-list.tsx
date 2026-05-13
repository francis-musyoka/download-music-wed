"use client";

import { Download, ListMusic, Play } from "lucide-react";
import type { Track, DownloadedTrack } from "@/lib/types";
import { TrackCard } from "./track-card";
import { BulkActionButton } from "./ui/bulk-action-button";

type Row = Track | DownloadedTrack;

interface Props {
    tracks: Row[];
    inputLabel: string;
    note?: string;
    playingKey?: string | null;
    loadingKey?: string | null;
    downloadingKeys?: Set<string>;
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

export function ResultsList({ tracks, inputLabel,
    note,
    playingKey,
    loadingKey,
    downloadingKeys,
    onPlay,
    onDownloadOne,
    onDownloadAll,
    onDownloadM3U,
    zipBusy,
}: Props) {
    if (tracks.length === 0) return null;
    return (
        <section id="results" className="border-b border-line py-14 md:py-20">
            <div className="mx-auto max-w-[1400px] px-6 lg:px-12">
                <div className="mb-12 flex flex-col gap-8 lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-10">
                    <div>
                        <span className="mb-3 block font-mono text-xs uppercase tracking-widest text-fg-dim">
                            Search results <span className="text-accent">✦</span> {inputLabel}{" "}
                            <span className="text-accent">✦</span> {tracks.length} tracks
                        </span>
                        <h2
                            className="m-0 font-display font-[380] text-[clamp(44px,6vw,96px)] tracking-tighter leading-[0.95]"
                            style={{ fontVariationSettings: '"SOFT" 60, "WONK" 1, "opsz" 144' }}
                        >
                            Preview and <em className="italic text-accent pl-2">download.</em>
                        </h2>
                        <p className="m-0 mt-4 max-w-lg text-lg leading-relaxed text-fg-dim tracking-wide">
                            Click <InlinePlayHint /> to preview any track in your browser. Click{" "}
                            <InlineDownloadHint /> to save it as 320kbps. Or grab all{" "}
                            <strong className="text-fg">{tracks.length} at once</strong> .
                        </p>
                        {note && (
                            <p
                                role="status"
                                className="m-0 mt-3 max-w-lg text-sm italic leading-relaxed text-fg-dim"
                            >
                                {note}
                            </p>
                        )}
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                        <BulkActionButton
                            label="Bundle"
                            title="Download all (ZIP)"
                            sub={`${tracks.length} tracks`}
                            icon={<Download />}
                            accent="primary"
                            onClick={onDownloadAll}
                            disabled={zipBusy}
                            aria-label="Download all tracks as ZIP"
                        />
                        <BulkActionButton
                            label="Playlist"
                            title="Download (M3U)"
                            sub="Streaming order"
                            icon={<ListMusic />}
                            accent="secondary"
                            onClick={onDownloadM3U}
                            aria-label="Download playlist as M3U"
                        />
                    </div>
                </div>
                <div className="border-t border-line">
                    {tracks.map((t, i) => {
                        const k = rowKey(t, i);
                        return (
                            <TrackCard
                                key={k}
                                rank={i + 1}
                                track={t}
                                isPlaying={playingKey === k}
                                isLoading={loadingKey === k}
                                isDownloading={downloadingKeys?.has(k) ?? false}
                                onPlay={onPlay}
                                onDownload={onDownloadOne}
                            />
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

function InlinePlayHint() {
    return (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent align-middle text-black">
            <Play size={12} fill="currentColor" />
        </span>
    );
}

function InlineDownloadHint() {
    return (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-fg-dim align-middle text-fg">
            <Download size={12} />
        </span>
    );
}
