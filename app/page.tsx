"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { HowToDownload } from "@/components/how-to-download";
import { HowItWorksModal } from "@/components/how-it-works-modal";
import { AppPanel, type StatusLine } from "@/components/app-panel";
import { ResultsList } from "@/components/results-list";
import { Footer } from "@/components/footer";
import { AudioPlayer, type AudioHandle } from "@/components/audio-player";
import { DownloadDock, type DockItem } from "@/components/download-dock";
import { subscribeJob } from "@/lib/client/sse";
import { toast } from "@/hooks/use-toast";
import type { DownloadedTrack, Mode, ProgressEvent, Track } from "@/lib/types";
import { ValueProps } from "@/components/value-props";
import { MOCK_TRACKS } from "@/lib/fixtures/mock-tracks";

type Row = Track | DownloadedTrack;

const STAGE_LABELS: Record<string, string> = {
    "scraping-spotify": "Crate digging",
    "enriching-youtube": "Sourcing audio",
    "enriching-dates": "Reading press dates",
    scoring: "Scoring the cut",
    "llm-reranking": "Polishing the cut",
    "llm-reranked": "Polishing the cut",
    "llm-degraded": "Polishing skipped",
    downloading: "Pressing tracks",
};

interface LastDownloadJob {
    jobId: string;
    files?: DownloadedTrack[];
}

declare global {
    interface Window {
        __lastDownloadJob?: LastDownloadJob;
    }
}

function trackLabel(t: Track | DownloadedTrack): string {
    return `${t.artist} — ${t.title}`;
}

function rowKey(t: Row, i: number): string {
    const v = (t as Track).videoId;
    if (v) return v;
    const f = (t as DownloadedTrack).fileName;
    if (f) return f;
    return String(i);
}

interface PreviewCacheEntry {
    streamUrl: string;
    expiresAtMs: number;
}

// Module-scoped client-side memo for preview stream URLs keyed by videoId.
// Mirrors the server cache — avoids a round-trip for repeat plays in-session.
// 5min safety margin before client-side expiry.
const previewCache = new Map<string, PreviewCacheEntry>();
const PREVIEW_CLIENT_SAFETY_MS = 5 * 60 * 1000;

async function resolvePreviewUrl(videoId: string): Promise<string | null> {
    const proxyUrl = `/api/stream/${encodeURIComponent(videoId)}`;
    const now = Date.now();
    const cached = previewCache.get(videoId);
    if (cached && now < cached.expiresAtMs - PREVIEW_CLIENT_SAFETY_MS) {
        return proxyUrl;
    }
    try {
        // We hit /api/preview first (cheap once warmed) so we know upfront
        // whether yt-dlp can resolve the video — if it can't, we surface that
        // as null and the caller falls back to download. The actual audio
        // bytes are streamed through /api/stream (same-origin, no ORB).
        const res = await fetch(`/api/preview/${encodeURIComponent(videoId)}`);
        if (!res.ok) {
            throw new Error(`Preview failed: ${res.status}`);
        }
        const data = (await res.json()) as {
            streamUrl?: string;
            expiresAtMs?: number;
        };
        if (!data.streamUrl || typeof data.expiresAtMs !== "number") {
            throw new Error("Preview response missing fields");
        }
        previewCache.set(videoId, {
            streamUrl: proxyUrl,
            expiresAtMs: data.expiresAtMs,
        });
        return proxyUrl;
    } catch (err) {
        console.warn("Preview fetch failed, falling back to download:", err);
        return null;
    }
}

function seedDockFromTracks(jobId: string, tracks: Track[]): DockItem[] {
    return tracks.map((t, i) => ({
        id: `${jobId}-${i}`,
        name: t.title,
        sub: t.artist,
        state: "queued" as const,
        progress: "—",
    }));
}

export default function Page() {
    const [howOpen, setHowOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<StatusLine[]>([]);
    const [tracks, setTracks] = useState<Row[]>([]);
    const [note, setNote] = useState<string | undefined>(undefined);
    const [quota, setQuota] = useState<{
        overall: { used: number; max: number; resetsAt: number };
        expensive: { used: number; max: number; resetsAt: number };
    } | undefined>(undefined);
    const [inputLabel, setInputLabel] = useState("");
    const [dock, setDock] = useState<DockItem[]>([]);
    const [playingKey, setPlayingKey] = useState<string | null>(null);
    const [loadingKey, setLoadingKey] = useState<string | null>(null);
    // Set of row keys with an in-flight per-track download. Lets us spin & gate
    // the ↓ button so a user can't kick off duplicate jobs by impatient clicks.
    const [downloadingKeys, setDownloadingKeys] = useState<Set<string>>(
        () => new Set(),
    );
    // True while a bulk ZIP or M3U job is running. Independent of `busy` (which
    // is shared across search + every download) so we can gate per-track ↓ and
    // the other bulk button without affecting the search spinner.
    const [bulkBusy, setBulkBusy] = useState(false);
    // Audio player open/closed (label set). Used to lift the DownloadDock above
    // the player on small screens so they don't overlap at the bottom-right.
    const [audioVisible, setAudioVisible] = useState(false);

    const audioRef = useRef<AudioHandle>(null);

    // One shared SSE subscription slot. Every handler that starts a new job
    // must cancel the previous subscription before opening a new one, so rapid
    // re-submits can't stack open EventSource connections (Chrome caps at 6
    // per origin). Also torn down on unmount for HMR / Fast Refresh safety.
    const sseRef = useRef<(() => void) | null>(null);

    const refreshQuota = useCallback(async () => {
        try {
            const r = await fetch("/api/quota");
            if (r.ok) setQuota(await r.json());
        } catch {
            // Silent: quota indicator is informational, not critical.
        }
    }, []);

    useEffect(() => {
        refreshQuota();
    }, [refreshQuota]);

    useEffect(() => {
        return () => {
            sseRef.current?.();
            sseRef.current = null;
        };
    }, []);

    // Dev-only escape hatch: `?mock=1` pre-loads the fixture track list so the
    // audio player (preview, next/prev, auto-advance) can be exercised without
    // burning a real search. Hard-gated on NODE_ENV !== "production" so this
    // can never surface in a deployed build.
    useEffect(() => {
        if (process.env.NODE_ENV === "production") return;
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        if (params.get("mock") !== "1") return;
        setTracks(MOCK_TRACKS);
        setInputLabel("mock · 5 tracks");
    }, []);

    const openHow = useCallback(() => setHowOpen(true), []);
    const closeDock = useCallback(() => setDock([]), []);

    /**
     * Kick off a download job. Seeds dock items (if `body.tracks` provided),
     * subscribes to SSE, and updates dock items as progress flows in. On done,
     * stashes `{ jobId, files }` on window for potential ZIP retrieval.
     *
     * ONLY argument is `body`, so dep list is `[]`. setState functions are stable.
     */
    const startDownload = useCallback(
        async (body: {
            tracks?: Track[];
            url?: string;
            playlistName?: string;
        }): Promise<DownloadedTrack[] | undefined> => {
            setBusy(true);
            let jobId: string;
            try {
                const res = await fetch("/api/download", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    throw new Error(`Download request failed: ${res.status} ${text}`);
                }
                const data = (await res.json()) as { jobId: string };
                jobId = data.jobId;
            } catch (err) {
                setBusy(false);
                toast({
                    title: "Download failed to start",
                    description: err instanceof Error ? err.message : String(err),
                    variant: "destructive",
                });
                return;
            }

            // Seed dock entries for each explicit track. For URL mode we seed a
            // single placeholder item whose name/sub is updated once yt-dlp reports
            // the actual filename via onDone.
            if (body.tracks && body.tracks.length > 0) {
                const seeded = seedDockFromTracks(jobId, body.tracks);
                setDock((prev) => [...prev, ...seeded]);
            } else if (body.url) {
                setDock((prev) => [
                    ...prev,
                    {
                        id: `${jobId}-0`,
                        name: "Downloading…",
                        sub: body.url!,
                        state: "downloading",
                        progress: "…",
                    },
                ]);
            }

            let jobResolver!: (v: DownloadedTrack[] | undefined) => void;
            const jobPromise = new Promise<DownloadedTrack[] | undefined>((resolve) => {
                jobResolver = resolve;
            });

            sseRef.current?.();
            sseRef.current = subscribeJob(jobId, {
                onProgress: (ev: ProgressEvent) => {
                    if (ev.stage !== "downloading") return;
                    if (typeof ev.current !== "number") return;
                    const idx = ev.current - 1;
                    const itemId = `${jobId}-${idx}`;
                    setDock((prev) =>
                        prev.map((d) => {
                            if (d.id !== itemId) return d;
                            const trackName = ev.track
                                ? (ev.track as Track).title ?? d.name
                                : d.name;
                            const trackSub = ev.track
                                ? (ev.track as Track).artist ?? d.sub
                                : d.sub;
                            if (ev.status === "ok") {
                                return {
                                    ...d,
                                    name: trackName,
                                    sub: trackSub,
                                    state: "done",
                                    progress: "DONE",
                                };
                            }
                            if (ev.status === "failed") {
                                return {
                                    ...d,
                                    name: trackName,
                                    sub: trackSub,
                                    state: "failed",
                                };
                            }
                            return {
                                ...d,
                                name: trackName,
                                sub: trackSub,
                                state: "downloading",
                                progress:
                                    typeof ev.total === "number"
                                        ? `${ev.current}/${ev.total}`
                                        : `${ev.current}`,
                            };
                        }),
                    );
                },
                onDone: (done) => {
                    setBusy(false);
                    const files =
                        done.stage === "complete" && Array.isArray(done.result)
                            ? (done.result as DownloadedTrack[])
                            : undefined;
                    if (typeof window !== "undefined") {
                        window.__lastDownloadJob = { jobId, files };
                    }
                    // URL mode: update the placeholder dock item with the real file info.
                    if (body.url && files && files.length > 0) {
                        const f = files[0];
                        setDock((prev) =>
                            prev.map((d) =>
                                d.id === `${jobId}-0`
                                    ? { ...d, name: f.title, sub: f.artist, state: "done", progress: "DONE" }
                                    : d,
                            ),
                        );
                    }
                    // Merge downloaded files back into the current `tracks` state so the
                    // row's ▶ button now plays the cached file instead of re-downloading.
                    if (files && files.length > 0) {
                        setTracks((prev) =>
                            prev.map((t) => {
                                const title = (t as Track).title;
                                if (!title) return t;
                                const downloaded = files.find(
                                    (f) => f.title === title || f.fileName.startsWith(title),
                                );
                                return downloaded
                                    ? {
                                        ...downloaded,
                                        // preserve original metadata we already had on the Track
                                        duration: (t as Track).duration ?? downloaded.duration,
                                        artist: (t as Track).artist || downloaded.artist,
                                    }
                                    : t;
                            }),
                        );
                        jobResolver(files);
                    } else if (done.stage === "failed") {
                        toast({
                            title: "Download job failed",
                            description: done.error ?? "unknown error",
                            variant: "destructive",
                        });
                        jobResolver(undefined);
                    } else {
                        jobResolver(undefined);
                    }
                },
            });

            return jobPromise;
        },
        [],
    );

    /**
     * Append/upgrade a status line based on the incoming progress event. If a
     * line for this stage already exists, replace it (keeps "current" if the
     * stage is still in flight). Otherwise mark older "current" lines as "done"
     * and push the new stage as "current".
     */
    const pushStatus = useCallback((ev: ProgressEvent): void => {
        const label = STAGE_LABELS[ev.stage];
        if (!label) return;
        const text =
            ev.stage === "downloading" &&
                typeof ev.current === "number" &&
                typeof ev.total === "number"
                ? `${label} (${ev.current}/${ev.total})`
                : ev.message
                    ? `${label} — ${ev.message}`
                    : label;

        setStatus((prev) => {
            const existingIdx = prev.findIndex((l) =>
                l.text.startsWith(label),
            );
            if (existingIdx >= 0) {
                const next = prev.slice();
                next[existingIdx] = { text, state: "current" };
                return next;
            }
            const next = prev.map((l) =>
                l.state === "current" ? { ...l, state: "done" as const } : l,
            );
            next.push({ text, state: "current" });
            return next;
        });
    }, []);

    const submit = useCallback(
        async (p: {
            mode: Mode;
            input: string | { title: string; artist: string };
            limit?: number;
            name?: string;
        }): Promise<void> => {
            if (p.mode === "url") {
                if (typeof p.input !== "string") return; // unreachable: url mode always passes string
                await startDownload({ url: p.input, playlistName: p.name });
                return;
            }

            setTracks([]);
            setNote(undefined);
            setStatus([]);
            const labelInput =
                typeof p.input === "string" ? p.input : `${p.input.title} — ${p.input.artist}`;
            setInputLabel(`${p.mode} · ${labelInput}`);
            setBusy(true);

            let jobId: string;
            try {
                const res = await fetch("/api/rank", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        mode: p.mode,
                        input: p.input,
                        limit: p.limit,
                    }),
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    throw new Error(`Rank request failed: ${res.status} ${text}`);
                }
                const data = (await res.json()) as { jobId: string };
                jobId = data.jobId;
                refreshQuota();
            } catch (err) {
                setBusy(false);
                toast({
                    title: "Search failed to start",
                    description: err instanceof Error ? err.message : String(err),
                    variant: "destructive",
                });
                return;
            }

            sseRef.current?.();
            sseRef.current = subscribeJob(jobId, {
                onProgress: (ev) => {
                    pushStatus(ev);
                    if (ev.stage === "complete" && ev.note) {
                        setNote(ev.note);
                    }
                },
                onDone: (done) => {
                    setBusy(false);
                    refreshQuota();
                    if (done.stage === "complete" && Array.isArray(done.result)) {
                        setTracks(done.result as Track[]);
                    } else if (done.stage === "failed") {
                        toast({
                            title: "Search failed",
                            description: done.error ?? "unknown error",
                            variant: "destructive",
                        });
                    }
                    // Mark all status lines as done so the UI settles.
                    setStatus((prev) =>
                        prev.map((l) => ({ ...l, state: "done" as const })),
                    );
                },
            });
        },
        [startDownload, pushStatus, refreshQuota],
    );

    const playTrack = useCallback(
        async (t: Row): Promise<void> => {
            const idx = tracks.findIndex((x) => x === t);
            const key = rowKey(t, idx < 0 ? 0 : idx);

            // Clicking the already-playing row stops playback.
            if (playingKey === key) {
                audioRef.current?.stop();
                return;
            }

            // Show spinner immediately. AudioPlayer's onPlay/onError clear it.
            setLoadingKey(key);
            try {
                const cachedName = (t as DownloadedTrack).fileName;
                if (cachedName) {
                    audioRef.current?.play(
                        `/api/audio/${encodeURIComponent(cachedName)}`,
                        trackLabel(t),
                        key,
                    );
                    return;
                }
                const videoId = (t as Track).videoId;
                if (videoId) {
                    const streamUrl = await resolvePreviewUrl(videoId);
                    if (streamUrl) {
                        audioRef.current?.play(streamUrl, trackLabel(t), key);
                        return;
                    }
                }
                const files = await startDownload({ tracks: [t as Track] });
                if (files && files[0]) {
                    audioRef.current?.play(
                        `/api/audio/${encodeURIComponent(files[0].fileName)}`,
                        trackLabel(t),
                        key,
                    );
                } else {
                    setLoadingKey(null);
                }
            } catch (err) {
                setLoadingKey(null);
                throw err;
            }
        },
        [startDownload, tracks, playingKey],
    );

    // Adjacent-track navigation for the audio player's next/prev buttons and
    // auto-advance on `ended`. `playingIdx` is computed from the live key so
    // we always navigate relative to whatever is *currently* playing — not
    // whatever the user clicked on last.
    const playingIdx = useMemo(() => {
        if (!playingKey) return -1;
        return tracks.findIndex((t, i) => rowKey(t, i) === playingKey);
    }, [tracks, playingKey]);
    const hasPrev = playingIdx > 0;
    const hasNext = playingIdx >= 0 && playingIdx < tracks.length - 1;
    const playNext = useCallback(() => {
        if (!hasNext) return;
        void playTrack(tracks[playingIdx + 1]);
    }, [hasNext, playTrack, tracks, playingIdx]);
    const playPrev = useCallback(() => {
        if (!hasPrev) return;
        void playTrack(tracks[playingIdx - 1]);
    }, [hasPrev, playTrack, tracks, playingIdx]);

    const downloadOne = useCallback(
        async (t: Row): Promise<void> => {
            const idx = tracks.findIndex((x) => x === t);
            const key = rowKey(t, idx < 0 ? 0 : idx);
            if (downloadingKeys.has(key)) return;

            setDownloadingKeys((prev) => {
                const next = new Set(prev);
                next.add(key);
                return next;
            });
            try {
                let fileName = (t as DownloadedTrack).fileName;
                if (!fileName) {
                    const files = await startDownload({ tracks: [t as Track] });
                    if (!files || !files[0]) return;
                    fileName = files[0].fileName;
                }
                const a = document.createElement("a");
                a.href = `/api/audio/${encodeURIComponent(fileName)}`;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } finally {
                setDownloadingKeys((prev) => {
                    if (!prev.has(key)) return prev;
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
            }
        },
        [startDownload, tracks, downloadingKeys],
    );

    const downloadAllZip = useCallback(async (): Promise<void> => {
        if (tracks.length === 0) return;
        // Only Track entries can be sent to /api/download. Results from a rank
        // pass are always raw Tracks, but guard anyway.
        const rankTracks = tracks.filter(
            (t): t is Track => !(t as DownloadedTrack).fileName,
        );
        const payloadTracks = rankTracks.length > 0 ? rankTracks : (tracks as Track[]);

        setBusy(true);
        setBulkBusy(true);
        let jobId: string;
        try {
            const res = await fetch("/api/download", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tracks: payloadTracks,
                    playlistName: inputLabel,
                }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(`ZIP request failed: ${res.status} ${text}`);
            }
            const data = (await res.json()) as { jobId: string };
            jobId = data.jobId;
        } catch (err) {
            setBusy(false);
            setBulkBusy(false);
            toast({
                title: "ZIP failed to start",
                description: err instanceof Error ? err.message : String(err),
                variant: "destructive",
            });
            return;
        }

        const seeded = seedDockFromTracks(jobId, payloadTracks);
        setDock((prev) => [...prev, ...seeded]);

        sseRef.current?.();
        sseRef.current = subscribeJob(jobId, {
            onProgress: (ev) => {
                if (ev.stage !== "downloading") return;
                if (typeof ev.current !== "number") return;
                const idx = ev.current - 1;
                const itemId = `${jobId}-${idx}`;
                setDock((prev) =>
                    prev.map((d) => {
                        if (d.id !== itemId) return d;
                        if (ev.status === "ok") {
                            return { ...d, state: "done", progress: "DONE" };
                        }
                        if (ev.status === "failed") {
                            return { ...d, state: "failed" };
                        }
                        return {
                            ...d,
                            state: "downloading",
                            progress:
                                typeof ev.total === "number"
                                    ? `${ev.current}/${ev.total}`
                                    : `${ev.current}`,
                        };
                    }),
                );
            },
            onDone: (done) => {
                setBusy(false);
                setBulkBusy(false);
                if (done.stage === "complete") {
                    // Trigger ZIP download. Using location.href keeps any cookies and
                    // works for file-download response headers from the API.
                    window.location.href = `/api/zip/${jobId}`;
                } else {
                    toast({
                        title: "ZIP failed",
                        description: done.error ?? "unknown error",
                        variant: "destructive",
                    });
                }
            },
        });
    }, [tracks, inputLabel]);

    const downloadM3U = useCallback(async (): Promise<void> => {
        if (tracks.length === 0) return;
        const rankTracks = tracks.filter(
            (t): t is Track => !(t as DownloadedTrack).fileName,
        );
        const payloadTracks = rankTracks.length > 0 ? rankTracks : (tracks as Track[]);

        setBusy(true);
        setBulkBusy(true);
        let jobId: string;
        try {
            const res = await fetch("/api/download", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tracks: payloadTracks,
                    playlistName: inputLabel,
                }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                throw new Error(`M3U request failed: ${res.status} ${text}`);
            }
            const data = (await res.json()) as { jobId: string };
            jobId = data.jobId;
        } catch (err) {
            setBusy(false);
            setBulkBusy(false);
            toast({
                title: "M3U failed to start",
                description: err instanceof Error ? err.message : String(err),
                variant: "destructive",
            });
            return;
        }

        const seeded = seedDockFromTracks(jobId, payloadTracks);
        setDock((prev) => [...prev, ...seeded]);

        sseRef.current?.();
        sseRef.current = subscribeJob(jobId, {
            onProgress: (ev) => {
                if (ev.stage !== "downloading") return;
                if (typeof ev.current !== "number") return;
                const idx = ev.current - 1;
                const itemId = `${jobId}-${idx}`;
                setDock((prev) =>
                    prev.map((d) => {
                        if (d.id !== itemId) return d;
                        if (ev.status === "ok") {
                            return { ...d, state: "done", progress: "DONE" };
                        }
                        if (ev.status === "failed") {
                            return { ...d, state: "failed" };
                        }
                        return {
                            ...d,
                            state: "downloading",
                            progress:
                                typeof ev.total === "number"
                                    ? `${ev.current}/${ev.total}`
                                    : `${ev.current}`,
                        };
                    }),
                );
            },
            onDone: (done) => {
                setBusy(false);
                setBulkBusy(false);
                if (done.stage === "complete") {
                    toast({
                        title: "Playlist written",
                        description:
                            "M3U and tracks saved to playlists/ on the server.",
                    });
                } else {
                    toast({
                        title: "M3U failed",
                        description: done.error ?? "unknown error",
                        variant: "destructive",
                    });
                }
            },
        });
    }, [tracks, inputLabel]);

    return (
        <>
            <Nav onHowClick={openHow} />
            <Hero onHowClick={openHow} />
            <HowToDownload />
            <AppPanel onSubmit={submit} statusLines={status} busy={busy} quota={quota} />
            <ResultsList
                tracks={tracks}
                inputLabel={inputLabel}
                note={note}
                playingKey={playingKey}
                loadingKey={loadingKey}
                downloadingKeys={downloadingKeys}
                bulkBusy={bulkBusy}
                anyPerTrackBusy={downloadingKeys.size > 0}
                onPlay={playTrack}
                onDownloadOne={downloadOne}
                onDownloadAll={downloadAllZip}
                onDownloadM3U={downloadM3U}
            />
            <ValueProps />
            <Footer />
            <AudioPlayer
                ref={audioRef}
                onPlay={(k) => {
                    setPlayingKey(k);
                    setLoadingKey(null);
                }}
                onPause={() => setPlayingKey(null)}
                onError={() => setLoadingKey(null)}
                onVisibilityChange={setAudioVisible}
                onEnded={playNext}
                onNext={playNext}
                onPrev={playPrev}
                hasNext={hasNext}
                hasPrev={hasPrev}
            />
            <DownloadDock items={dock} onClose={closeDock} liftedAbove={audioVisible} />
            <HowItWorksModal open={howOpen} onOpenChange={setHowOpen} />
        </>
    );
}
