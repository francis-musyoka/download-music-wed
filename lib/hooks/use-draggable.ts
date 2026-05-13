"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

export interface DragPos {
    left: number;
    top: number;
}

/**
 * Pointer-based drag for a floating panel.
 *
 * Returns a callback `handleRef` that the consumer attaches to the drag handle
 * (via `ref={handleRef}`). A callback ref is used because the handle may not
 * be mounted on the hook's first useEffect run — e.g. the audio player only
 * renders the handle button when a track is playing. With `useRef`, the hook
 * would never see the element mount.
 *
 * Any descendant marked `data-no-drag` (close buttons, retry icons, sliders)
 * is exempted from drag-start so its click still fires.
 */
export function useDraggable<T extends HTMLElement = HTMLElement>(
    containerRef: RefObject<HTMLElement | null>,
) {
    const [handle, setHandle] = useState<T | null>(null);
    const [pos, setPos] = useState<DragPos | null>(null);
    const [dragging, setDragging] = useState(false);
    const startRef = useRef<{
        x: number;
        y: number;
        left: number;
        top: number;
    } | null>(null);

    useEffect(() => {
        if (!handle) return;

        function onDown(e: PointerEvent) {
            if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            startRef.current = {
                x: e.clientX,
                y: e.clientY,
                left: rect.left,
                top: rect.top,
            };
            setPos({ left: rect.left, top: rect.top });
            setDragging(true);
            handle!.setPointerCapture(e.pointerId);
            e.preventDefault();
        }

        function onMove(e: PointerEvent) {
            if (!startRef.current) return;
            const dx = e.clientX - startRef.current.x;
            const dy = e.clientY - startRef.current.y;
            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();
            const maxX = window.innerWidth - rect.width - 4;
            const maxY = window.innerHeight - rect.height - 4;
            const left = Math.max(4, Math.min(maxX, startRef.current.left + dx));
            const top = Math.max(4, Math.min(maxY, startRef.current.top + dy));
            setPos({ left, top });
        }

        function onUp(e: PointerEvent) {
            startRef.current = null;
            setDragging(false);
            try {
                handle!.releasePointerCapture(e.pointerId);
            } catch {
                /* no-op */
            }
        }

        handle.addEventListener("pointerdown", onDown);
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
        handle.addEventListener("pointercancel", onUp);
        return () => {
            handle.removeEventListener("pointerdown", onDown);
            handle.removeEventListener("pointermove", onMove);
            handle.removeEventListener("pointerup", onUp);
            handle.removeEventListener("pointercancel", onUp);
        };
    }, [handle, containerRef]);

    const style: CSSProperties | undefined = pos
        ? {
              left: pos.left,
              top: pos.top,
              right: "auto",
              bottom: "auto",
          }
        : undefined;

    return {
        handleRef: setHandle as (el: T | null) => void,
        pos,
        dragging,
        style,
    };
}
