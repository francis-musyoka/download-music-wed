"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const CARDS: {
    n: string;
    accent: "accent" | "accent-2";
    title: string;
    body: string;
}[] = [
        {
            n: "01",
            accent: "accent",
            title: "Real hits.",
            body: "Search a song and get the song. The version that actually charted, the one in the room when it dropped. First result, every time.",
        },
        {
            n: "02",
            accent: "accent-2",
            title: "Proper MP3s.",
            body: "320 kbps with title, artist, album, and cover art embedded. Drops straight into Plex, your car, or a USB stick. Already tagged.",
        },
        {
            n: "03",
            accent: "accent",
            title: "Yours alone.",
            body: "Use it like a vending machine. Drop a query, take your track, walk away. No login wall, no follow-up, no inbox spam.",
        },
    ];

export function ValueProps() {
    const cardRefs = useRef<(HTMLElement | null)[]>([]);
    const [active, setActive] = useState(0);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                for (const e of entries) {
                    if (e.isIntersecting && e.intersectionRatio >= 0.55) {
                        const idx = cardRefs.current.findIndex(
                            (c) => c === e.target,
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
            inline: "start",
        });
    };

    return (
        <section
            id="why"
            className="border-b border-line bg-bg py-14 md:py-20"
        >
            <div className="mx-auto max-w-[1400px] px-6 md:px-12">
                <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:mb-8">
                    <h2
                        className="m-0 font-display text-3xl font-medium tracking-tighter md:text-4xl lg:text-5xl"
                        style={{
                            fontVariationSettings:
                                '"SOFT" 60, "WONK" 1, "opsz" 144',
                        }}
                    >
                        Three reasons.{"  "}
                        <em className="italic text-accent">Worth the click.</em>
                    </h2>
                    <div
                        className="flex items-center gap-2 md:hidden"
                        aria-label="Swipe between cards"
                    >
                        {CARDS.map((c, i) => (
                            <button
                                key={c.n}
                                type="button"
                                onClick={() => scrollToCard(i)}
                                aria-label={`Show card ${c.n}: ${c.title}`}
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

                <div className="-mx-6 md:mx-0">
                    <div
                        className={cn(
                            "flex snap-x snap-mandatory scroll-pl-6 gap-4 overflow-x-auto px-6 pb-3",
                            "md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0 md:pb-0",
                            "[&::-webkit-scrollbar]:hidden",
                        )}
                        style={{ scrollbarWidth: "none" }}
                    >
                        {CARDS.map((c, i) => (
                            <article
                                key={c.n}
                                ref={(el) => {
                                    cardRefs.current[i] = el;
                                }}
                                className={cn(
                                    "flex shrink-0 snap-start flex-col gap-3 border border-line-bright bg-bg-2 p-5 transition-colors hover:border-fg",
                                    "w-[85vw] max-w-sm sm:w-[55vw]",
                                    "md:w-auto md:shrink md:p-6",
                                )}
                            >
                                <span
                                    className={cn(
                                        "inline-flex size-9 items-center justify-center font-display text-sm font-semibold text-bg",
                                        c.accent === "accent"
                                            ? "bg-accent"
                                            : "bg-accent-2",
                                    )}
                                    style={{
                                        fontVariationSettings:
                                            '"SOFT" 40, "WONK" 1, "opsz" 72',
                                    }}
                                >
                                    {c.n}
                                </span>
                                <h3
                                    className="m-0 font-display text-xl font-medium leading-tight tracking-tight md:text-2xl"
                                    style={{
                                        fontVariationSettings:
                                            '"SOFT" 50, "WONK" 1, "opsz" 72',
                                    }}
                                >
                                    {c.title}
                                </h3>
                                <p className="m-0 text-sm leading-relaxed text-fg-dim">
                                    {c.body}
                                </p>
                            </article>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
