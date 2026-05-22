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
            <div
                className={cn(
                    "flex items-center gap-2 border border-line-bright bg-transparent px-3.5 transition-colors md:px-4",
                    "hover:border-fg focus-within:border-accent focus-within:bg-bg",
                )}
            >
                <input
                    id={fieldId}
                    type={inputType}
                    className={cn(
                        "block w-full appearance-none bg-transparent py-2.5 outline-none",
                        "text-lg font-medium text-fg md:text-xl",
                        "placeholder:text-fg-muted",
                        className,
                    )}
                    {...rest}
                />
                {trailing}
            </div>
        </div>
    );
}
