"use client";

import {
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
    type Ref,
} from "react";
import { GripVertical, Pause, Play, X } from "lucide-react";
import { useDraggable } from "@/lib/hooks/use-draggable";
import { cn } from "@/lib/utils";

export interface AudioHandle {
    play: (src: string, label: string, key: string) => void;
    stop: () => void;
}

interface AudioPlayerProps {
    ref?: Ref<AudioHandle>;
    onPlay?: (key: string) => void;
    onPause?: () => void;
    onError?: () => void;
    /** Fires when the player becomes visible (track loaded) or hides (closed, ended). */
    onVisibilityChange?: (visible: boolean) => void;
}

function fmtTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

export function AudioPlayer({ ref, onPlay, onPause, onError, onVisibilityChange }: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // trackKey is read inside the <audio> event handler; a ref beats state
    // here because play() fires asynchronously and state updates queued
    // alongside audioRef.current.play() haven't committed yet when the event
    // dispatches.
    const trackKeyRef = useRef<string | null>(null);
    const [label, setLabel] = useState<string | null>(null);
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [duration, setDuration] = useState(0);
    const { handleRef, pos, dragging } = useDraggable<HTMLButtonElement>(containerRef);

    useImperativeHandle(ref, () => ({
        play(src, l, k) {
            if (!audioRef.current) return;
            trackKeyRef.current = k;
            audioRef.current.src = src;
            void audioRef.current.play().catch(() => {});
            setLabel(l);
        },
        stop() {
            if (!audioRef.current) return;
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            trackKeyRef.current = null;
            setLabel(null);
            setPlaying(false);
            onPause?.();
        },
    }));

    useEffect(() => {
        const el = audioRef.current;
        if (!el) return;
        const onPlayEv = () => {
            setPlaying(true);
            const k = trackKeyRef.current;
            if (k) onPlay?.(k);
        };
        const onPauseEv = () => {
            setPlaying(false);
            onPause?.();
        };
        const onEnded = () => {
            // Defensive: detach the source so the element can't auto-continue.
            // YouTube Music "Topic" channel URLs sometimes resolve to a manifest
            // that chains the artist's other tracks — without this teardown the
            // browser follows the chain when the first track ends.
            el.pause();
            el.removeAttribute("src");
            el.load();
            setPlaying(false);
            trackKeyRef.current = null;
            setLabel(null);
            onPause?.();
        };
        const onTime = () => setCurrent(el.currentTime);
        const onMeta = () => setDuration(el.duration || 0);
        const onErrorEv = () => {
            onError?.();
        };
        el.addEventListener("play", onPlayEv);
        el.addEventListener("pause", onPauseEv);
        el.addEventListener("ended", onEnded);
        el.addEventListener("timeupdate", onTime);
        el.addEventListener("loadedmetadata", onMeta);
        el.addEventListener("error", onErrorEv);
        return () => {
            el.removeEventListener("play", onPlayEv);
            el.removeEventListener("pause", onPauseEv);
            el.removeEventListener("ended", onEnded);
            el.removeEventListener("timeupdate", onTime);
            el.removeEventListener("loadedmetadata", onMeta);
            el.removeEventListener("error", onErrorEv);
        };
    }, [onPlay, onPause, onError]);

    useEffect(() => {
        onVisibilityChange?.(!!label);
    }, [label, onVisibilityChange]);

    const togglePlay = () => {
        const el = audioRef.current;
        if (!el) return;
        if (el.paused) void el.play().catch(() => {});
        else el.pause();
    };

    const seekFromClick = (ev: React.MouseEvent<HTMLDivElement>) => {
        const el = audioRef.current;
        const bar = progressRef.current;
        if (!el || !bar || !duration) return;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
        el.currentTime = ratio * duration;
        setCurrent(el.currentTime);
    };

    const close = () => {
        const el = audioRef.current;
        if (el) {
            el.pause();
            el.currentTime = 0;
        }
        trackKeyRef.current = null;
        setLabel(null);
        setPlaying(false);
        onPause?.();
    };

    const pct = duration > 0 ? (current / duration) * 100 : 0;

    // Use drag position only while a track is playing. When the player is
    // closed (label null), force off-screen so the empty shell isn't visible.
    const useDragPos = !!(label && pos);
    const positionStyle = useDragPos
        ? { left: pos!.left, top: pos!.top, right: "auto", bottom: "auto" }
        : undefined;

    return (
        <div
            ref={containerRef}
            role="region"
            aria-label="Audio player"
            className={cn(
                "fixed z-30 flex items-center gap-3 border border-line-bright bg-bg-2 px-3 py-2.5",
                "shadow-[6px_6px_0_var(--accent)] font-mono",
                // Width: cap at 480px on desktop, viewport-minus-gutter on mobile.
                "w-[480px] max-w-[calc(100vw-1.5rem)]",
                // Default bottom-right anchor when not dragged. Slide up from
                // off-screen when label flips on.
                !useDragPos && [
                    "right-3 md:right-6",
                    "transition-[bottom] duration-200 ease-out",
                    label ? "bottom-4 md:bottom-6" : "-bottom-40",
                ],
            )}
            style={positionStyle}
        >
            <audio ref={audioRef} />
            {label && (
                <>
                    <button
                        ref={handleRef}
                        type="button"
                        aria-label="Drag player"
                        className={cn(
                            "inline-flex size-9 shrink-0 items-center justify-center",
                            "border border-line-bright text-fg-dim touch-none select-none",
                            "transition-colors hover:border-fg hover:text-fg",
                            dragging ? "cursor-grabbing" : "cursor-grab",
                        )}
                    >
                        <GripVertical size={14} />
                    </button>
                    <button
                        type="button"
                        data-no-drag
                        onClick={togglePlay}
                        aria-label={playing ? "Pause" : "Play"}
                        className="inline-flex size-9 shrink-0 items-center justify-center bg-fg text-bg transition-colors hover:bg-accent"
                    >
                        {playing ? (
                            <Pause size={14} fill="currentColor" />
                        ) : (
                            <Play size={14} fill="currentColor" />
                        )}
                    </button>
                    <div
                        className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] uppercase tracking-widest text-fg"
                        title={label}
                    >
                        {label}
                    </div>
                    <div
                        ref={progressRef}
                        data-no-drag
                        onClick={seekFromClick}
                        role="slider"
                        aria-label="Seek"
                        aria-valuemin={0}
                        aria-valuemax={duration || 0}
                        aria-valuenow={current}
                        className="relative h-1.5 w-20 cursor-pointer bg-line-bright sm:w-[140px]"
                    >
                        <div
                            className="absolute inset-y-0 left-0 bg-accent"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <div className="hidden whitespace-nowrap text-[11px] text-fg-dim sm:block">
                        {fmtTime(current)} / {fmtTime(duration)}
                    </div>
                    <button
                        type="button"
                        data-no-drag
                        onClick={close}
                        aria-label="Close player"
                        className="inline-flex size-9 shrink-0 items-center justify-center border border-line-bright text-fg-dim transition-colors hover:border-accent hover:text-accent"
                    >
                        <X size={14} />
                    </button>
                </>
            )}
        </div>
    );
}
