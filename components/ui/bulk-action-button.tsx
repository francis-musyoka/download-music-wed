"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Accent = "primary" | "secondary";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
    label: string;
    title: string;
    sub?: string;
    icon: ReactNode;
    accent?: Accent;
    /**
     * Visually disabled (opacity + cursor) and aria-disabled for a11y, but the
     * native `disabled` attribute is NOT set — onClick still fires so the parent
     * can decide to show a toast / dialog / etc. Use `disabled` instead when the
     * button should be truly inert.
     */
    blocked?: boolean;
}

export function BulkActionButton({
    label,
    title,
    sub,
    icon,
    accent = "primary",
    blocked = false,
    className,
    type,
    "aria-disabled": ariaDisabled,
    ...rest
}: Props) {
    return (
        <button
            type={type ?? "button"}
            aria-disabled={blocked || ariaDisabled}
            className={cn(
                "group flex w-full items-center justify-between gap-4",
                "rounded-2xl border border-line-bright bg-bg-2 p-5 text-left",
                "transition-all duration-200 ease-out",
                "hover:-translate-y-0.5",
                accent === "primary" && "hover:border-accent",
                accent === "secondary" && "hover:border-accent-2",
                "disabled:opacity-55 disabled:cursor-not-allowed disabled:pointer-events-none",
                blocked && "opacity-55 cursor-not-allowed hover:translate-y-0",
                blocked && accent === "primary" && "hover:border-line-bright",
                blocked && accent === "secondary" && "hover:border-line-bright",
                className,
            )}
            {...rest}
        >
            <span className="flex flex-col gap-1">
                <span className="font-mono text-xs uppercase tracking-widest text-fg-muted">
                    {label}
                </span>
                <span className="font-display text-lg font-medium tracking-tight text-fg">
                    {title}
                </span>
                {sub && <span className="font-mono text-xs text-fg-dim">{sub}</span>}
            </span>
            <span
                className={cn(
                    "inline-flex size-12 shrink-0 items-center justify-center rounded-full text-bg",
                    "transition-transform duration-200 group-hover:scale-110",
                    "[&>svg]:size-5",
                    accent === "primary" && "bg-accent",
                    accent === "secondary" && "bg-accent-2",
                    blocked && "group-hover:scale-100",
                )}
            >
                {icon}
            </span>
        </button>
    );
}
