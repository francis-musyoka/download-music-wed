"use client";

import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeroProps {
    onHowClick: () => void;
}

export function Hero({ onHowClick }: HeroProps) {
    return (
        <section
            id="hero"
            className="relative isolate flex min-h-[520px] flex-col items-center justify-end overflow-hidden border-b border-line bg-bg px-5 pb-14 pt-12 text-center md:min-h-[640px] md:pb-20 md:pt-16"
        >
            <div
                aria-hidden
                className="absolute inset-0 -z-20"
                style={{
                    backgroundImage: "url('/hero-bg.jpg')",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                }}
            />
            <div
                aria-hidden
                className="absolute inset-0 -z-10"
                style={{
                    background:
                        "linear-gradient(180deg, rgba(12,10,9,0.55) 0%, rgba(12,10,9,0.78) 55%, rgba(12,10,9,0.97) 100%)",
                }}
            />

            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-fg/40 bg-bg/70 px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.3em] text-fg backdrop-blur-md">
                <span className="size-1.5 animate-pulse rounded-full bg-accent-2" />
                Free · 320kbps · No signup
            </span>

            <h1
                className="m-0 max-w-3xl font-display font-medium leading-[0.92] tracking-tighter text-fg"
                style={{
                    fontSize: "clamp(2.5rem, 10vw, 6.5rem)",
                    fontVariationSettings: '"SOFT" 60, "WONK" 1, "opsz" 144',
                }}
            >
                Real hits, <em className="italic text-accent">free to keep.</em>
            </h1>

            <p
        className="m-0 mt-5 max-w-md text-base leading-relaxed text-fg md:text-lg"
        style={{ textShadow: "0 2px 12px rgba(0,0,0,0.95)" }}
      >
                Search by genre, artist, song, or paste a link. Preview every
                track in your browser, then download the ones you love as{" "}
                <strong className="text-fg">320kbps MP3s</strong>. No signup. No
                ads.
            </p>

            <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row">
                <a
                    href="#app"
                    className={cn(
                        "group inline-flex items-center justify-center gap-3 rounded-full px-7 py-3.5",
                        "bg-accent text-bg",
                        "font-mono text-sm font-semibold uppercase tracking-widest",
                        "transition-transform duration-150 hover:scale-[1.02]",
                    )}
                >
                    <Play size={14} fill="currentColor" />
                    Start searching
                </a>
                <a
                    href="#how"
                    onClick={(e) => {
                        e.preventDefault();
                        onHowClick();
                    }}
                    className="inline-flex items-center justify-center gap-3 rounded-full border border-fg/40 bg-bg/30 px-7 py-3.5 font-mono text-sm uppercase tracking-widest text-fg backdrop-blur transition-colors hover:bg-bg/60"
                >
                    How it works
                </a>
            </div>
        </section>
    );
}
