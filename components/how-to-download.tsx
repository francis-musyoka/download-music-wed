"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, Play } from "lucide-react";
import { HOW_STEPS } from "@/lib/constants/how-to-download";
import { cn } from "@/lib/utils";

export function HowToDownload() {
    const [active, setActive] = useState(0);
    const cardRefs = useRef<(HTMLElement | null)[]>([]);

    // Sync the active dot with whichever card is centered in the
    // snap-scroll carousel. Fires while the user swipes/scrolls.
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
                        const idx = cardRefs.current.findIndex(
                            (c) => c === entry.target,
                        );
                        if (idx >= 0) setActive(idx);
                    }
                }
            },
            { threshold: [0.55, 0.75] },
        );
        cardRefs.current.forEach((c) => c && observer.observe(c));
        return () => observer.disconnect();
    }, []);

    const scrollToCard = (i: number) => {
        setActive(i);
        cardRefs.current[i]?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
        });
    };

    return (
        <section
            id="how"
            className="relative overflow-hidden border-b border-line py-14 md:py-20"
        >
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        "radial-gradient(circle at 90% 30%, rgba(193,255,0,0.05), transparent 40%), radial-gradient(circle at 10% 80%, rgba(255,90,31,0.06), transparent 40%)",
                }}
            />

            <div className="relative mx-auto max-w-[1400px] px-6 md:px-12">
                <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <h2
                        className="m-0 whitespace-nowrap font-display font-medium tracking-tighter text-3xl sm:text-3xl md:text-4xl lg:text-5xl"
                        style={{
                            fontVariationSettings: '"SOFT" 60, "WONK" 1, "opsz" 144',
                        }}
                    >
                        Four steps.{" "}
                        <em className="italic text-accent">Swipe the flow.</em>
                    </h2>
                    <div className="flex items-center gap-2">
                        {HOW_STEPS.map((s, i) => (
                            <button
                                key={s.n}
                                type="button"
                                onClick={() => scrollToCard(i)}
                                aria-label={`Show step ${s.n}: ${s.title}`}
                                className={cn(
                                    "h-1.5 transition-all",
                                    i === active
                                        ? "w-8 bg-accent"
                                        : "w-3 bg-line-bright",
                                )}
                            />
                        ))}
                    </div>
                </header>

                <div className="-mx-6 md:-mx-12">
                    <div
                        className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4 md:gap-6 md:px-12 [&::-webkit-scrollbar]:hidden"
                        style={{ scrollbarWidth: "none" }}
                    >
                        {HOW_STEPS.map((s, i) => {
                            const accent = s.n % 2 === 1 ? "accent" : "accent-2";
                            return (
                                <article
                                    key={s.n}
                                    ref={(el) => {
                                        cardRefs.current[i] = el;
                                    }}
                                    className={cn(
                                        "shrink-0 snap-center border border-line-bright bg-bg-2 p-6 md:p-8",
                                        "w-[85vw] max-w-md sm:w-[60vw] md:w-[420px]",
                                        i === active &&
                                        "border-fg shadow-[6px_6px_0_var(--line-bright)]",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "inline-flex size-10 items-center justify-center font-display text-base font-semibold text-bg",
                                            accent === "accent"
                                                ? "bg-accent"
                                                : "bg-accent-2",
                                        )}
                                        style={{
                                            fontVariationSettings:
                                                '"SOFT" 40, "WONK" 1, "opsz" 72',
                                        }}
                                    >
                                        0{s.n}
                                    </span>
                                    <div className="mt-5">
                                        <StepIllustration n={s.n} />
                                    </div>
                                    <h3
                                        className="m-0 mt-5 font-display text-xl font-medium leading-tight tracking-tight md:text-2xl"
                                        style={{
                                            fontVariationSettings:
                                                '"SOFT" 50, "WONK" 1, "opsz" 72',
                                        }}
                                    >
                                        {s.title}
                                    </h3>
                                    <p className="m-0 mt-3 text-sm leading-relaxed text-fg-dim md:text-base">
                                        {s.body}
                                    </p>
                                </article>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-10">
                    <a
                        href="#app"
                        className={cn(
                            "group inline-flex items-center gap-3 self-start px-5 py-3.5",
                            "border border-accent bg-accent text-bg",
                            "font-mono text-sm font-medium uppercase tracking-widest",
                            "transition-transform duration-150 hover:translate-x-1",
                        )}
                    >
                        Try it now
                        <ArrowDown
                            size={16}
                            className="transition-transform group-hover:translate-y-0.5"
                        />
                    </a>
                </div>
            </div>
        </section>
    );
}

// ────────────────────────────────────────────────────────────
// Step illustrations — ported from the original .icon-* CSS
// classes into inline Tailwind. Each is a stylized mini-preview
// of what the corresponding step looks like in the real UI.
// ────────────────────────────────────────────────────────────

function StepIllustration({ n }: { n: number }) {
    const shell =
        "flex h-[100px] items-center justify-center overflow-hidden border border-dashed border-line-bright bg-bg";

    if (n === 1) {
        const tabs: { label: string; live?: boolean }[] = [
            { label: "Genre", live: true },
            { label: "Artist" },
            { label: "Song" },
            { label: "URL" },
        ];
        return (
            <div className={shell}>
                <div className="grid h-full w-full grid-cols-2 gap-1.5 p-2.5">
                    {tabs.map((t) => (
                        <span
                            key={t.label}
                            className={cn(
                                "flex items-center justify-center border font-mono text-[10px] uppercase tracking-[0.1em]",
                                t.live
                                    ? "border-accent text-accent"
                                    : "border-line-bright bg-bg-2 text-fg-dim",
                            )}
                        >
                            {t.label}
                        </span>
                    ))}
                </div>
            </div>
        );
    }

    if (n === 2) {
        const rows: { rank: string; width: string; score: string }[] = [
            { rank: "01", width: "100%", score: "9.8" },
            { rank: "02", width: "80%", score: "9.4" },
            { rank: "03", width: "60%", score: "9.1" },
        ];
        return (
            <div className={shell}>
                <div className="flex w-full flex-col gap-1 px-3.5 py-2.5">
                    {rows.map((r, i) => (
                        <div
                            key={r.rank}
                            className={cn(
                                "grid grid-cols-[22px_1fr_auto] items-center gap-2 py-1.5",
                                i < rows.length - 1 && "border-b border-line",
                            )}
                        >
                            <span className="font-display text-base font-medium text-accent">
                                {r.rank}
                            </span>
                            <span
                                className="h-[2px] rounded-sm"
                                style={{
                                    width: r.width,
                                    background:
                                        "linear-gradient(90deg, var(--accent), transparent)",
                                }}
                            />
                            <span className="bg-accent-2 px-1.5 py-px font-mono text-[10px] font-semibold text-bg">
                                {r.score}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (n === 3) {
        const bars: { h: number; color: string }[] = [
            { h: 12, color: "bg-fg-dim" },
            { h: 24, color: "bg-accent" },
            { h: 36, color: "bg-accent" },
            { h: 20, color: "bg-fg-dim" },
            { h: 30, color: "bg-accent-2" },
            { h: 14, color: "bg-fg-dim" },
            { h: 22, color: "bg-fg-dim" },
        ];
        return (
            <div className={shell}>
                <div className="flex items-center gap-3.5">
                    <span className="flex size-12 items-center justify-center bg-accent text-bg shadow-[3px_3px_0_var(--fg)]">
                        <Play size={18} fill="currentColor" />
                    </span>
                    <div className="flex items-center gap-[3px]">
                        {bars.map((b, i) => (
                            <span
                                key={i}
                                className={cn("w-[3px] rounded-sm", b.color)}
                                style={{ height: `${b.h}px` }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // n === 4
    const chips: { label: string; suffix: string; primary?: boolean }[] = [
        { label: "Single MP3", suffix: "320K", primary: true },
        { label: "ZIP of all", suffix: "10 tracks" },
        { label: "M3U Playlist", suffix: ".M3U" },
    ];
    return (
        <div className={shell}>
            <div className="flex w-full flex-col gap-1.5 px-2.5">
                {chips.map((c) => (
                    <div
                        key={c.label}
                        className={cn(
                            "grid grid-cols-[auto_1fr_auto] items-center gap-2.5 border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em]",
                            c.primary
                                ? "border-accent-2 bg-[rgba(193,255,0,0.08)] text-fg-dim"
                                : "border-line-bright bg-bg-2 text-fg-dim",
                        )}
                    >
                        <span
                            className={cn(
                                "font-semibold",
                                c.primary ? "text-accent-2" : "text-accent",
                            )}
                        >
                            ↓
                        </span>
                        <span>{c.label}</span>
                        <span>{c.suffix}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
