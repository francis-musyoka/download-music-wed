"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { HOW_IT_WORKS_STEPS } from "@/lib/constants/how-it-works";
import { cn } from "@/lib/utils";

interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
}

export function HowItWorksModal({ open, onOpenChange }: Props) {
    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-[200] bg-bg/85 backdrop-blur-sm" />
                <DialogPrimitive.Content
                    aria-describedby={undefined}
                    className={cn(
                        "fixed left-1/2 top-1/2 z-[201] -translate-x-1/2 -translate-y-1/2",
                        "w-[calc(100%-2rem)] max-w-[760px]",
                        "max-h-[86vh] overflow-y-auto",
                        "border border-line-bright bg-bg-2 shadow-[14px_14px_0_var(--accent)]",
                    )}
                >
                    <DialogPrimitive.Title className="sr-only">
                        How the cut is made
                    </DialogPrimitive.Title>
                    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg-2 px-6 py-4">
                        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
                            Liner notes · How the cut is made
                        </span>
                        <DialogPrimitive.Close
                            aria-label="Close"
                            className="inline-flex size-9 items-center justify-center border border-line-bright text-fg-dim transition-colors hover:border-accent hover:text-accent"
                        >
                            <X size={14} />
                        </DialogPrimitive.Close>
                    </header>
                    <div className="px-6 py-8 md:px-10 md:py-10">
                        <h3
                            className="m-0 font-display font-medium leading-[0.95] tracking-tighter"
                            style={{
                                fontSize: "clamp(2rem, 5.5vw, 3.5rem)",
                                fontVariationSettings: '"SOFT" 60, "WONK" 1, "opsz" 144',
                            }}
                        >
                            Six steps from{" "}
                            <em className="italic text-accent">signal</em> to ear.
                        </h3>
                        <ol className="mt-8 flex flex-col">
                            {HOW_IT_WORKS_STEPS.map((s, i) => (
                                <li
                                    key={s.n}
                                    className={cn(
                                        "grid grid-cols-[3rem_1fr] items-baseline gap-4 border-t border-line py-5 md:grid-cols-[4.5rem_1fr] md:gap-6",
                                        i === HOW_IT_WORKS_STEPS.length - 1 && "border-b",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "font-display text-3xl font-medium tracking-tight md:text-5xl",
                                            i % 2 === 0 ? "text-accent" : "text-accent-2",
                                        )}
                                        style={{
                                            fontVariationSettings:
                                                '"SOFT" 40, "WONK" 1, "opsz" 144',
                                        }}
                                    >
                                        {s.n}
                                    </span>
                                    <div className="flex flex-col gap-1.5">
                                        <h4
                                            className="m-0 font-display text-lg font-medium tracking-tight text-fg md:text-xl"
                                            style={{
                                                fontVariationSettings:
                                                    '"SOFT" 50, "WONK" 0, "opsz" 72',
                                            }}
                                        >
                                            {s.title}
                                        </h4>
                                        <p className="m-0 text-sm leading-relaxed text-fg-dim md:text-base">
                                            {s.body}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
