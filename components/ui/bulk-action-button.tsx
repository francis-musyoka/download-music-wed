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
}

export function BulkActionButton({
    label,
    title,
    sub,
    icon,
    accent = "primary",
    className,
    type,
    ...rest
}: Props) {
    return (
        <button
            type={type ?? "button"}
            className={cn(
                "group flex w-full items-center justify-between gap-4",
                "rounded-2xl border border-line-bright bg-bg-2 p-5 text-left",
                "transition-all duration-200 ease-out",
                "hover:-translate-y-0.5",
                accent === "primary" && "hover:border-accent",
                accent === "secondary" && "hover:border-accent-2",
                "disabled:opacity-55 disabled:cursor-not-allowed disabled:pointer-events-none",
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
                )}
            >
                {icon}
            </span>
        </button>
    );
}
