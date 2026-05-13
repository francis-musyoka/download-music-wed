"use client";

import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
    label: string;
    inputType?: "text" | "number" | "url";
    trailing?: ReactNode;
}

export function TextInput({ label, inputType = "text", id, className, trailing, ...rest }: Props) {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
        <div className="flex flex-col gap-2">
            <label
                htmlFor={fieldId}
                className="font-mono text-[11px] uppercase tracking-widest text-fg-dim"
            >
                {label}
                {rest.required && (
                    <span className="ml-1 text-red-600" aria-hidden>
                        *
                    </span>
                )}
            </label>
            <div className="flex items-baseline gap-2">
                <input
                    id={fieldId}
                    type={inputType}
                    className={cn(
                        "block w-full appearance-none border-0 border-b border-line-bright bg-transparent py-3",
                        "text-xl font-medium text-fg outline-none transition-colors",
                        "placeholder:text-fg-muted focus:border-accent",
                        className,
                    )}
                    {...rest}
                />
                {trailing}
            </div>
        </div>
    );
}
