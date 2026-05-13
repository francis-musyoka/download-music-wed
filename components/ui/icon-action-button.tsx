"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "default" | "primary";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
    variant?: Variant;
    loading?: boolean;
    active?: boolean;
    children: ReactNode;
}

export function IconActionButton({
    variant = "default",
    loading = false,
    active = false,
    className,
    type,
    disabled,
    children,
    ...rest
}: Props) {
    return (
        <button
            type={type ?? "button"}
            disabled={disabled ?? loading}
            aria-busy={loading || undefined}
            className={cn(
                "inline-flex items-center justify-center",
                "h-11 w-11",
                "[&>svg]:size-5",
                "border cursor-pointer transition duration-200 ease-out",
                variant === "default" && [
                    "bg-transparent border-line-bright text-fg",
                    "hover:border-accent hover:text-accent",
                ],
                variant === "primary" && [
                    "bg-fg border-fg text-bg",
                    "hover:bg-accent hover:border-accent hover:text-bg",
                    active && "bg-accent border-accent text-bg",
                ],
                "disabled:cursor-wait disabled:opacity-85",
                "disabled:hover:border-line-bright disabled:hover:text-fg",
                variant === "primary" && [
                    "disabled:hover:bg-fg disabled:hover:border-fg disabled:hover:text-bg",
                ],
                className,
            )}
            {...rest}
        >
            {loading ? <Loader2 className="animate-spin" /> : children}
        </button>
    );
}
