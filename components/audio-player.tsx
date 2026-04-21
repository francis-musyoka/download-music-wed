"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";

export interface AudioHandle {
  play: (src: string, label: string, key: string) => void;
  stop: () => void;
}

interface AudioPlayerProps {
  ref?: Ref<AudioHandle>;
  onPlay?: (key: string) => void;
  onPause?: () => void;
}

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AudioPlayer({ ref, onPlay, onPause }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  // trackKey is read inside the <audio> event handler; a ref beats state here
  // because play() fires asynchronously and state updates queued alongside
  // audioRef.current.play() haven't committed yet when the event dispatches.
  const trackKeyRef = useRef<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

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
      setPlaying(false);
      trackKeyRef.current = null;
      setLabel(null);
      onPause?.();
    };
    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => setDuration(el.duration || 0);
    el.addEventListener("play", onPlayEv);
    el.addEventListener("pause", onPauseEv);
    el.addEventListener("ended", onEnded);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    return () => {
      el.removeEventListener("play", onPlayEv);
      el.removeEventListener("pause", onPauseEv);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
    };
  }, [onPlay, onPause]);

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

  return (
    <div className={`player${label ? " player--open" : ""}`} role="region" aria-label="Audio player">
      <audio ref={audioRef} />
      {label && (
        <>
          <button
            type="button"
            className="player__btn"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <div className="player__label" title={label}>{label}</div>
          <div
            ref={progressRef}
            className="player__bar"
            onClick={seekFromClick}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={duration || 0}
            aria-valuenow={current}
          >
            <div className="player__fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="player__time">{fmtTime(current)} / {fmtTime(duration)}</div>
          <button
            type="button"
            className="player__close"
            onClick={close}
            aria-label="Close player"
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}
