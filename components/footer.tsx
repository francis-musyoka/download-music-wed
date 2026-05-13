import type { ReactNode } from "react";
import { BRAND_NAME } from "@/lib/constants/brand";
import { cn } from "@/lib/utils";

const SIDE_A = ["Genre", "Artist", "Single", "Direct URL"];
const SIDE_B = ["320 kbps MP3", "Embedded artwork", "M3U export", "ZIP bundle"];
const CATALOG = ["WAX-2026-001", "MIT Licence"];

export function Footer() {
    return (
        <footer className="border-t border-line bg-bg-2 px-6 pb-10 pt-16 md:px-12">
            <div className="mx-auto max-w-[1400px]">
                <div className="grid grid-cols-2 gap-x-6 gap-y-10 border-b border-line pb-12 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:gap-10">
                    <div className="col-span-2 md:col-span-1">
                        <h3
                            className="m-0 font-display text-4xl font-medium leading-none tracking-tight md:text-5xl"
                            style={{ fontVariationSettings: '"SOFT" 60, "WONK" 1, "opsz" 72' }}
                        >
                            {BRAND_NAME}
                            <em className="italic text-accent">.</em>
                        </h3>
                        <p className="m-0 mt-3 max-w-sm text-sm leading-relaxed text-fg-dim">
                            An open hit detector. Cut from curated playlists,
                            stream-count signal, and a healthy distrust of algorithms.
                        </p>
                    </div>
                    <FooterCol head="Side A" items={SIDE_A} />
                    <FooterCol head="Side B" items={SIDE_B} muted />
                    <FooterCol
                        head="Catalog"
                        items={CATALOG}
                        className="col-span-2 md:col-span-1"
                    />
                </div>
                <div className="mt-6 flex flex-col gap-2 font-mono text-[11px] uppercase tracking-widest text-fg-muted sm:flex-row sm:items-center sm:justify-between">
                    <span>© 2026 {BRAND_NAME}</span>
                    <span>Side A · 2026 · Cut 001</span>
                </div>
            </div>
        </footer>
    );
}

function FooterCol({
    head,
    items,
    muted = false,
    className,
}: {
    head: string;
    items: string[];
    muted?: boolean;
    className?: string;
}): ReactNode {
    return (
        <div className={cn("flex flex-col gap-3", className)}>
            <span
                className={cn(
                    "font-mono text-[11px] uppercase tracking-widest",
                    muted ? "text-accent-2" : "text-accent",
                )}
            >
                {head}
            </span>
            <ul className="flex flex-col gap-1.5">
                {items.map((item, i) => (
                    <li
                        key={item}
                        className={cn(
                            "text-sm",
                            i === 0 ? "font-semibold text-fg" : "text-fg-dim",
                        )}
                    >
                        {item}
                    </li>
                ))}
            </ul>
        </div>
    );
}
