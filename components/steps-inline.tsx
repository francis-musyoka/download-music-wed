import { cn } from "@/lib/utils";

const STEPS = [
    { label: "Search", sub: "pick a mode" },
    { label: "Preview", sub: "in-browser" },
    { label: "Download", sub: "save tracks" },
] as const;

const STEP_BG = ["bg-accent", "bg-accent-2", "bg-accent"] as const;

export function StepsInline() {
    return (
        <ol className="flex items-center gap-4 border-b border-line-bright bg-bg px-4 py-3 md:gap-6 md:px-6">
            {STEPS.map((s, i) => (
                <li key={s.label} className="flex flex-1 items-center gap-2.5">
                    <span
                        className={cn(
                            "inline-flex size-7 shrink-0 items-center justify-center font-display text-sm font-semibold text-bg",
                            STEP_BG[i],
                        )}
                    >
                        {i + 1}
                    </span>
                    <div className="flex flex-col leading-none">
                        <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-fg">
                            {s.label}
                        </span>
                        <span className="mt-1 hidden font-mono text-[10px] text-fg-dim md:inline">
                            {s.sub}
                        </span>
                    </div>
                </li>
            ))}
        </ol>
    );
}
