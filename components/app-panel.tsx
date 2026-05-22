"use client";

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Check, CircleDot, Headphones, Link2, Loader2, Mic2, Music2 } from "lucide-react";
import type { Mode } from "@/lib/types";
import { BUTTON_LABELS, MODE_HEADINGS } from "@/lib/constants/app-panel";
import { StepsInline } from "./steps-inline";
import { GenreInput } from "./inputs/genre-input";
import { ArtistInput } from "./inputs/artist-input";
import { SongInput } from "./inputs/song-input";
import { UrlInput } from "./inputs/url-input";
import { cn } from "@/lib/utils";

export interface QuotaTier {
    used: number;
    max: number;
    resetsAt: number;
}

export interface Quota {
    overall: QuotaTier;
    expensive: QuotaTier;
}

// Show a warning when a tier has this many or fewer slots remaining.
// Tuned to match the spec'd thresholds: expensive 25/30, overall 140/150.
const EXPENSIVE_WARN_REMAINING = 5;
const OVERALL_WARN_REMAINING = 10;

export interface StatusLine {
    text: string;
    state: "done" | "current" | "pending";
}

const MODE_ICONS: Record<Mode, ReactNode> = {
    genre: <Music2 size={16} />,
    artist: <Mic2 size={16} />,
    song: <Headphones size={16} />,
    url: <Link2 size={16} />,
};

const MODES: Mode[] = ["genre", "artist", "song", "url"];

interface Props {
    onSubmit: (p: {
        mode: Mode;
        input: string | { title: string; artist: string };
        limit?: number;
        name?: string;
    }) => void;
    statusLines?: StatusLine[];
    busy?: boolean;
    quota?: Quota;
}

export function AppPanel({ onSubmit, statusLines = [], busy, quota }: Props) {
    const [mode, setMode] = useState<Mode>("genre");
    const [genre, setGenre] = useState("");
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
            if (!genre.trim()) return;
            onSubmit({
                mode,
                input: genre,
                limit: genreLimit,
                name: genreName || `${genre} Hits`,
            });
        } else if (mode === "artist") {
            if (!artist.trim()) return;
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
        <section
            id="app"
            className="border-b border-line py-14 md:py-20"
        >
            <div className="mx-auto max-w-[1400px] px-6 md:px-12">
                <div className="overflow-hidden border border-line-bright bg-bg-2">
                    <StepsInline />

                    <div className="flex flex-col md:flex-row">
                        <nav
                            className="flex border-b border-line-bright bg-bg md:w-16 md:flex-col md:border-b-0 md:border-r"
                            aria-label="Search mode"
                        >
                            {MODES.map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMode(m)}
                                    aria-pressed={mode === m}
                                    className={cn(
                                        "group relative flex flex-1 min-w-0 flex-col items-center justify-center gap-1.5 px-2 py-3 transition-colors",
                                        "md:flex-none md:gap-3 md:px-4 md:py-6",
                                        mode === m
                                            ? "bg-bg-2 text-accent"
                                            : "text-fg-dim hover:bg-bg-2 hover:text-fg",
                                    )}
                                >
                                    {mode === m && (
                                        <span
                                            className={cn(
                                                "absolute left-0 right-0 bottom-0 h-1 bg-accent",
                                                "md:left-auto md:right-0 md:top-0 md:bottom-0 md:h-auto md:w-1",
                                            )}
                                        />
                                    )}
                                    {MODE_ICONS[m]}
                                    <span
                                        className={cn(
                                            "font-mono text-[11px] uppercase tracking-widest",
                                            "md:[writing-mode:vertical-rl] md:rotate-180",
                                        )}
                                    >
                                        {m}
                                    </span>
                                </button>
                            ))}
                        </nav>

                        <div className="relative flex-1 p-5 md:p-10">
                            <span className="absolute right-5 top-5 hidden font-mono text-[10px] uppercase tracking-[0.3em] text-fg-muted md:right-8 md:top-8 md:inline">
                                Drop the needle
                            </span>

                            <header className="mb-8 flex items-baseline gap-3 md:mb-10">
                                <span className="inline-flex items-center justify-center text-accent">
                                    {MODE_ICONS[mode]}
                                </span>
                                <h2
                                    className="m-0 font-display text-3xl font-medium tracking-tight md:text-4xl"
                                    style={{
                                        fontVariationSettings: '"SOFT" 50, "WONK" 1, "opsz" 72',
                                    }}
                                >
                                    {MODE_HEADINGS[mode]}
                                </h2>
                            </header>

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

                            <div className="mt-8 flex flex-col items-stretch gap-4 border-t border-dashed border-line pt-6 md:flex-row md:items-center md:justify-between">
                                {(() => {
                                    if (!quota) return null;
                                    const expRemain = quota.expensive.max - quota.expensive.used;
                                    const overallRemain = quota.overall.max - quota.overall.used;
                                    // Only render when the user is close to (or over) a cap.
                                    // Below threshold we stay silent — no decorative
                                    // "Resets midnight UTC" line at rest. Expensive surfaces
                                    // first in genre mode since it's the tighter cap.
                                    let msg: string | null = null;
                                    if (mode === "genre" && expRemain <= EXPENSIVE_WARN_REMAINING) {
                                        msg = expRemain <= 0
                                            ? "Genre search exhausted — try artist, song, or URL · back at midnight UTC"
                                            : `${expRemain} genre ${expRemain === 1 ? "search" : "searches"} left today · other modes still work`;
                                    } else if (overallRemain <= OVERALL_WARN_REMAINING) {
                                        msg = overallRemain <= 0
                                            ? "Daily limit reached · back at midnight UTC"
                                            : `${overallRemain} ${overallRemain === 1 ? "search" : "searches"} left today`;
                                    }
                                    if (!msg) return null;
                                    return (
                                        <span className="font-mono text-[11px] uppercase tracking-widest text-fg-dim">
                                            {msg}
                                        </span>
                                    );
                                })()}
                                <button
                                    type="button"
                                    onClick={handleGo}
                                    disabled={busy}
                                    aria-busy={busy || undefined}
                                    className={cn(
                                        "inline-flex items-center justify-center gap-3 px-6 py-3.5",
                                        "bg-accent text-bg border border-accent",
                                        "font-mono text-sm uppercase tracking-widest font-medium",
                                        "transition-transform duration-150",
                                        "hover:translate-x-1 md:ml-auto",
                                        "disabled:opacity-55 disabled:cursor-not-allowed disabled:pointer-events-none disabled:hover:translate-x-0",
                                    )}
                                >
                                    {busy ? (
                                        <>
                                            Searching…
                                            <Loader2 size={16} className="animate-spin" />
                                        </>
                                    ) : (
                                        <>
                                            {BUTTON_LABELS[mode]}
                                            <ArrowRight size={16} />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {statusLines.length > 0 && (
                        <div
                            className="grid grid-cols-2 gap-px border-t border-line-bright bg-line md:grid-cols-4"
                            role="status"
                        >
                            {statusLines.map((l, i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-2 bg-bg-2 px-4 py-3 font-mono text-[10px] uppercase tracking-widest"
                                >
                                    <StatusGlyph state={l.state} />
                                    <span
                                        className={cn(l.state === "pending" && "text-fg-muted")}
                                    >
                                        {l.text}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

function StatusGlyph({ state }: { state: StatusLine["state"] }) {
    if (state === "done")
        return <Check size={12} className="shrink-0 text-accent-2" />;
    if (state === "current")
        return <Loader2 size={12} className="shrink-0 animate-spin text-accent" />;
    return <CircleDot size={12} className="shrink-0 text-fg-muted" />;
}
