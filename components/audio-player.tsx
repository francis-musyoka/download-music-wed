"use client";

import { useImperativeHandle, useRef, useState, type Ref } from "react";

export interface AudioHandle {
  play: (src: string, label?: string) => void;
  stop: () => void;
}

interface AudioPlayerProps {
  ref?: Ref<AudioHandle>;
}

export function AudioPlayer({ ref }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [label, setLabel] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    play(src, l) {
      if (!audioRef.current) return;
      audioRef.current.src = src;
      audioRef.current.play().catch(() => {});
      setLabel(l ?? null);
    },
    stop() {
      audioRef.current?.pause();
      setLabel(null);
    },
  }));

  return (
    <div
      style={{
        position: "fixed",
        bottom: label ? 16 : -100,
        left: 16,
        right: 16,
        maxWidth: 480,
        margin: "0 auto",
        background: "var(--bg-2)",
        border: "1px solid var(--line-bright)",
        padding: 12,
        zIndex: 35,
        transition: "bottom 0.25s ease",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "6px 6px 0 var(--accent)",
      }}
    >
      <audio ref={audioRef} controls style={{ flex: 1 }} />
      {label && (
        <span
          style={{
            fontFamily: "var(--ff-mono)",
            fontSize: 11,
            letterSpacing: "0.1em",
            color: "var(--fg-dim)",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
