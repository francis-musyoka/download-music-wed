"use client";

import { BRAND_NAME } from "@/lib/constants/brand";

interface NavProps {
    onHowClick: () => void;
}

const LINK_CLASS =
    "rounded-full px-3.5 py-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-fg transition-colors hover:bg-accent hover:text-bg";

export function Nav({ onHowClick }: NavProps) {
    return (
        <nav className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-5 py-4 md:px-8">
            <a
                href="#"
                className="font-display text-xl font-medium  md:font-semibold leading-none tracking-tight text-fg"
                style={{ fontVariationSettings: '"SOFT" 30, "WONK" 1, "opsz" 72' }}
                aria-label={`${BRAND_NAME} home`}
            >
                {BRAND_NAME}
                <span className="text-accent">.</span>
            </a>
            <div className="flex items-center gap-1 rounded-full border border-fg/50 bg-bg/75 p-1 shadow-lg shadow-black/30 backdrop-blur-md">
                <a href="#why" className={LINK_CLASS}>
                    Why
                </a>
                <a href="#app" className={LINK_CLASS}>
                    Start
                </a>
                <a
                    href="#how"
                    onClick={(e) => {
                        e.preventDefault();
                        onHowClick();
                    }}
                    className={LINK_CLASS}
                >
                    How
                </a>
            </div>
        </nav>
    );
}
