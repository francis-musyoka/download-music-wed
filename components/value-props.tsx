import { cn } from "@/lib/utils";

interface Prop {
    num: string;
    title: [string, string];
    body: string;
}

const PROPS: Prop[] = [
    {
        num: "01 / DETECTION",
        title: ["Real hits,", "not filler."],
        body: "Crate-digs through curated playlists, cross-cuts with stream-count signal, scores every candidate on playlist position, plays, and recency. You get what people actually listen to — ranked.",
    },
    {
        num: "02 / FIDELITY",
        title: ["320kbps with", "proper metadata."],
        body: "Embedded album art. Title, artist, album tags. Not a 128kbps ripoff. Your car stereo will thank you; so will the engineer who mixed it.",
    },
    {
        num: "03 / LICENCE",
        title: ["No signup.", "No ads. No tracking."],
        body: "One URL, four modes, zero accounts. No emails to verify, no pixels to block, no subscription to cancel. Run it, use it, close the tab.",
    },
];

export function ValueProps() {
    return (
        <section id="why" className="border-b border-line py-14 md:py-20">
            <div className="mx-auto max-w-[1400px] px-6 md:px-12">
                <header className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
                    <h2
                        className="m-0 max-w-[760px] font-display font-[380] leading-[0.95] tracking-tighter"
                        style={{
                            fontSize: "clamp(28px, 6vw, 96px)",
                            fontVariationSettings: '"SOFT" 60, "WONK" 1, "opsz" 144',
                        }}
                    >
                        Hits, properly
                        <br />
                        <em className="italic text-accent">pressed.</em>
                    </h2>
                    <p className="m-0 max-w-[280px] text-right font-mono text-[11px] uppercase leading-loose tracking-widest text-fg-dim">
                        Three reasons
                        <br />
                        the needle
                        <br />
                        lands here.
                    </p>
                </header>
                <div className="grid grid-cols-1 border-t border-line md:grid-cols-[1.3fr_1fr_1fr]">
                    {PROPS.map((p, i) => (
                        <article
                            key={p.num}
                            className={cn(
                                "flex cursor-default flex-col gap-5 py-11 transition-colors duration-300 hover:bg-bg-2",
                                "border-b border-line md:border-b-0 md:border-r md:pl-9 md:pr-9",
                                i === 0 && "md:pl-0",
                                i === PROPS.length - 1 && "border-b-0 md:border-r-0 md:pr-0",
                            )}
                        >
                            <span className="font-mono text-[13px] uppercase tracking-widest text-accent-2">
                                {p.num}
                            </span>
                            <h3
                                className="m-0 font-display text-3xl font-medium leading-tight tracking-tight"
                                style={{
                                    fontVariationSettings:
                                        '"SOFT" 50, "WONK" 1, "opsz" 72',
                                }}
                            >
                                {p.title[0]}
                                <br />
                                {p.title[1]}
                            </h3>
                            <p className="m-0 text-[15px] leading-relaxed text-fg-dim">
                                {p.body}
                            </p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
