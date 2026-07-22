import { Counter, Gauge, Histogram, Registry } from "prom-client";
import { getInflightCount } from "./limits";

// Hoisted onto globalThis so these survive Next.js dev-mode module
// re-evaluation and stay shared across route handlers (each API route may be
// compiled into its own chunk with its own module instance otherwise) — same
// issue and same fix as JOBS in ./jobs.ts.
type GlobalWithMetrics = typeof globalThis & {
    __downloadMusicMetrics?: {
        register: Registry;
        downloadRequestsTotal: Counter<"status" | "reason" | "ip">;
        downloadJobsTotal: Counter<"outcome">;
        downloadJobDurationSeconds: Histogram<"outcome">;
        downloadTracksTotal: Counter<"ip" | "outcome">;
        downloadTrackDurationSeconds: Histogram<"outcome">;
    };
};
const globalRef = globalThis as GlobalWithMetrics;

function createMetrics() {
    const register = new Registry();

    const downloadRequestsTotal = new Counter({
        name: "download_requests_total",
        help: "Total /api/download requests, labeled by HTTP status, reason, and client IP",
        labelNames: ["status", "reason", "ip"],
        registers: [register],
    });

    const downloadJobsTotal = new Counter({
        name: "download_jobs_total",
        help: "Total finished download jobs, labeled by outcome",
        labelNames: ["outcome"],
        registers: [register],
    });

    const downloadJobDurationSeconds = new Histogram({
        name: "download_job_duration_seconds",
        help: "Download job duration in seconds, from creation to completion/failure/expiry, labeled by outcome",
        labelNames: ["outcome"],
        buckets: [1, 5, 15, 30, 60, 120, 300, 600],
        registers: [register],
    });

    new Gauge({
        name: "download_active_slots",
        help: "Current number of in-flight download jobs holding a concurrency slot",
        registers: [register],
        collect() {
            this.set(getInflightCount());
        },
    });

    const downloadTracksTotal = new Counter({
        name: "download_tracks_total",
        help: "Total individual tracks processed via /api/download, labeled by client IP and outcome (success/failed)",
        labelNames: ["ip", "outcome"],
        registers: [register],
    });

    const downloadTrackDurationSeconds = new Histogram({
        name: "download_track_duration_seconds",
        help: "Duration of a single track's yt-dlp download attempt, in seconds, labeled by outcome",
        labelNames: ["outcome"],
        buckets: [1, 2, 5, 10, 20, 30, 60, 120, 300],
        registers: [register],
    });

    return {
        register,
        downloadRequestsTotal,
        downloadJobsTotal,
        downloadJobDurationSeconds,
        downloadTracksTotal,
        downloadTrackDurationSeconds,
    };
}

const metrics = globalRef.__downloadMusicMetrics ?? (globalRef.__downloadMusicMetrics = createMetrics());

export const register = metrics.register;
export const downloadRequestsTotal = metrics.downloadRequestsTotal;
export const downloadJobsTotal = metrics.downloadJobsTotal;
export const downloadJobDurationSeconds = metrics.downloadJobDurationSeconds;
export const downloadTracksTotal = metrics.downloadTracksTotal;
export const downloadTrackDurationSeconds = metrics.downloadTrackDurationSeconds;
