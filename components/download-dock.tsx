"use client";

import { useEffect, useRef, useState } from "react";

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
}

export function DownloadDock({ items, onRetry, onClose }: Props) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dockRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;

    function onDown(e: PointerEvent) {
      if ((e.target as HTMLElement).closest(".dock__close")) return;
      const dock = dockRef.current;
      if (!dock) return;
      const rect = dock.getBoundingClientRect();
      startRef.current = {
        x: e.clientX,
        y: e.clientY,
        left: rect.left,
        top: rect.top,
      };
      setPos({ left: rect.left, top: rect.top });
      setDragging(true);
      handle!.setPointerCapture(e.pointerId);
    }

    function onMove(e: PointerEvent) {
      if (!startRef.current) return;
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      const dock = dockRef.current;
      if (!dock) return;
      const rect = dock.getBoundingClientRect();
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
  }, []);

  if (items.length === 0) return null;
  const activeCount = items.filter((i) => i.state === "downloading").length;

  return (
    <aside
      ref={dockRef}
      className={`dock${dragging ? " dragging" : ""}`}
      style={
        pos
          ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" }
          : undefined
      }
    >
      <div ref={handleRef} className="dock__head">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span className="dock__drag-hint" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span className="live">
            Transfer live · {activeCount}/{items.length}
          </span>
        </span>
        <button
          type="button"
          className="dock__close"
          onClick={onClose}
          aria-label="Hide downloads"
        >
          ─
        </button>
      </div>
      <div className="dock__body">
        {items.map((it) => (
          <div
            key={it.id}
            className={`dock__item${it.state === "done" ? " done" : ""}`}
          >
            <div className="dock__vinyl" />
            <div className="dock__info">
              <div className="name">{it.name}</div>
              <div className="sub">{it.sub}</div>
            </div>
            <div className="dock__progress">
              {it.state === "done" ? (
                "DONE"
              ) : it.state === "failed" ? (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => onRetry?.(it.id)}
                  aria-label="Retry"
                >
                  ↻
                </button>
              ) : (
                it.progress ?? "—"
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
