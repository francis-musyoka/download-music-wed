"use client";

import { useRef } from "react";
import { Check, GripHorizontal, Minus, RotateCcw } from "lucide-react";
import { useDraggable } from "@/lib/hooks/use-draggable";
import { cn } from "@/lib/utils";

export interface DockItem {
    id: string;
    name: string;
    sub: string;
    state: "downloading" | "done" | "failed" | "queued";
    progress?: string;
}

interface Props {
    items: DockItem[];
    onRetry?: (id: string) => void;
    onClose?: () => void;
    /** Lift the auto-anchored dock above the audio player to avoid overlap on small screens. */
    liftedAbove?: boolean;
}

export function DownloadDock({ items, onRetry, onClose, liftedAbove }: Props) {
    const dockRef = useRef<HTMLElement>(null);
    const { handleRef, pos, dragging } = useDraggable<HTMLDivElement>(dockRef);

    if (items.length === 0) return null;
    const activeCount = items.filter((i) => i.state === "downloading").length;

    return (
        <aside
            ref={dockRef}
            className={cn(
                "fixed z-40 w-[380px] max-w-[calc(100vw-1.5rem)] border border-line-bright bg-bg-2",
                "shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8),8px_8px_0_var(--accent)]",
                dragging &&
                    "shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9),12px_12px_0_var(--accent)]",
                !pos && [
                    "right-3 md:right-6",
                    "transition-[bottom] duration-200 ease-out",
                    liftedAbove ? "bottom-[5.5rem] md:bottom-24" : "bottom-4 md:bottom-6",
                ],
            )}
            style={
                pos
                    ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" }
                    : undefined
            }
        >
            <div
                ref={handleRef}
                className={cn(
                    "flex items-center justify-between gap-3 border-b border-line-bright bg-bg px-4 py-3.5",
                    "select-none touch-none font-mono text-[11px] uppercase tracking-widest",
                    dragging ? "cursor-grabbing" : "cursor-grab",
                )}
            >
                <span className="inline-flex items-center gap-2.5">
                    <GripHorizontal size={14} className="text-fg-muted" />
                    <span className="inline-flex items-center gap-2 text-accent-2">
                        <span className="size-1.5 animate-pulse rounded-full bg-accent-2" />
                        Transfer live · {activeCount}/{items.length}
                    </span>
                </span>
                <button
                    type="button"
                    data-no-drag
                    onClick={onClose}
                    aria-label="Hide downloads"
                    className="inline-flex size-7 items-center justify-center text-fg-dim transition-colors hover:text-accent"
                >
                    <Minus size={14} />
                </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
                {items.map((it) => (
                    <DockRow key={it.id} item={it} onRetry={onRetry} />
                ))}
            </div>
        </aside>
    );
}

function DockRow({
    item,
    onRetry,
}: {
    item: DockItem;
    onRetry?: (id: string) => void;
}) {
    const done = item.state === "done";
    const failed = item.state === "failed";
    return (
        <div className="grid grid-cols-[28px_1fr_auto] items-center gap-3.5 border-b border-line px-4 py-3.5 last:border-b-0">
            <DockVinyl done={done} />
            <div className="min-w-0">
                <div className="mb-0.5 truncate text-sm font-semibold leading-tight text-fg">
                    {item.name}
                </div>
                <div className="truncate font-mono text-[11px] tracking-wider text-fg-dim">
                    {item.sub}
                </div>
            </div>
            <div className="font-mono text-xs font-medium tracking-widest">
                {done ? (
                    <span className="text-accent-2">DONE</span>
                ) : failed ? (
                    <button
                        type="button"
                        data-no-drag
                        onClick={() => onRetry?.(item.id)}
                        aria-label="Retry"
                        className="inline-flex size-9 items-center justify-center border border-line-bright text-fg-dim transition-colors hover:border-accent hover:text-accent"
                    >
                        <RotateCcw size={14} />
                    </button>
                ) : (
                    <span className="text-accent">{item.progress ?? "—"}</span>
                )}
            </div>
        </div>
    );
}

function DockVinyl({ done }: { done: boolean }) {
    if (done) {
        return (
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-accent-2 text-bg">
                <Check size={14} strokeWidth={3} />
            </span>
        );
    }
    return (
        <span
            className="size-6 rounded-full"
            style={{
                background:
                    "radial-gradient(circle, var(--accent) 0 20%, var(--bg) 25%, var(--fg-muted) 30%, var(--bg) 35%, var(--fg-muted) 40%, var(--bg) 45%, var(--fg-muted) 50%, var(--bg) 100%)",
                animation: "spin 2s linear infinite",
            }}
        />
    );
}
