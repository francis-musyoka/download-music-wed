"use client";

import { useEffect, useId, useState } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { TextInput } from "@/components/ui/text-input";
import { CURATED_GENRES } from "@/lib/constants/genres";
import { cn } from "@/lib/utils";

interface Props {
    genre: string;
    limit: number;
    name: string;
    onGenre: (v: string) => void;
    onLimit: (v: number) => void;
    onName: (v: string) => void;
}

export function GenreInput({ genre, limit, name, onGenre, onLimit, onName }: Props) {
    const [raw, setRaw] = useState(String(limit));
    useEffect(() => { setRaw(String(limit)); }, [limit]);
    const triggerId = useId();

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <label
                    htmlFor={triggerId}
                    className="font-mono text-[11px] uppercase tracking-widest text-fg-dim"
                >
                    Genre
                    <span className="ml-1 text-red-600" aria-hidden>*</span>
                </label>
                <Select.Root
                    value={genre || undefined}
                    onValueChange={onGenre}
                >
                    <Select.Trigger
                        id={triggerId}
                        className={cn(
                            "flex w-full items-center justify-between gap-2 border border-line-bright bg-transparent px-3.5 py-2.5 outline-none transition-colors md:px-4",
                            "text-lg font-medium md:text-xl",
                            "hover:border-fg focus-visible:border-accent focus-visible:bg-bg",
                            "data-[state=open]:border-accent data-[state=open]:bg-bg",
                            "[&[data-placeholder]]:text-fg-muted",
                            genre ? "text-fg" : "text-fg-muted",
                        )}
                        aria-label="Genre"
                    >
                        <Select.Value placeholder="Choose a genre…" />
                        <Select.Icon asChild>
                            <ChevronDown size={16} className="text-fg-dim" />
                        </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                        <Select.Content
                            position="popper"
                            sideOffset={4}
                            className={cn(
                                "z-50 max-h-[320px] min-w-[var(--radix-select-trigger-width)] overflow-hidden",
                                "border border-line-bright bg-bg-2 shadow-[6px_6px_0_var(--accent)]",
                                "data-[state=open]:animate-in data-[state=closed]:animate-out",
                                "data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0",
                            )}
                        >
                            <Select.Viewport className="p-1">
                                {CURATED_GENRES.map((g) => (
                                    <Select.Item
                                        key={g}
                                        value={g}
                                        className={cn(
                                            "relative flex cursor-pointer items-center justify-between gap-3 px-3 py-2 outline-none",
                                            "text-base text-fg",
                                            "data-[highlighted]:bg-bg data-[highlighted]:text-accent",
                                            "data-[state=checked]:text-accent",
                                        )}
                                    >
                                        <Select.ItemText>{g}</Select.ItemText>
                                        <Select.ItemIndicator>
                                            <Check size={14} className="text-accent" />
                                        </Select.ItemIndicator>
                                    </Select.Item>
                                ))}
                            </Select.Viewport>
                        </Select.Content>
                    </Select.Portal>
                </Select.Root>
            </div>

            <TextInput
                label="Limit"
                inputType="number"
                value={raw}
                min={1}
                max={10}
                onChange={(e) => {
                    const v = e.target.value;
                    setRaw(v);
                    const n = parseInt(v, 10);
                    if (Number.isFinite(n) && n >= 1 && n <= 10) onLimit(n);
                }}
                onBlur={(e) => {
                    const n = parseInt(e.target.value, 10);
                    const clamped = Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 1;
                    setRaw(String(clamped));
                    onLimit(clamped);
                }}
            />
            <TextInput
                label="Playlist name"
                value={name}
                placeholder={genre ? `${genre} Hits` : "Pick a genre first"}
                onChange={(e) => onName(e.target.value)}
            />
        </div>
    );
}
