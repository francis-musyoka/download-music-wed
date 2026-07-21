import { Counter, Gauge, Histogram, Registry } from "prom-client";
import { getInflightCount } from "./limits";

// Hoisted onto globalThis so these survive Next.js dev-mode module
// re-evaluation and stay shared across route handlers (each API route may be
// compiled into its own chunk with its own module instance otherwise) — same
// issue and same fix as JOBS in ./jobs.ts.
type GlobalWithMetrics = typeof globalThis & {
    __downloadMusicMetrics?: {
        register: Registry;
        downloadRequestsTotal: Counter<"status" | "reason">;
        downloadJobsTotal: Counter<"outcome">;
        downloadJobDurationSeconds: Histogram<"outcome">;
    };
};
const globalRef = globalThis as GlobalWithMetrics;

function createMetrics() {
    const register = new Registry();

    const downloadRequestsTotal = new Counter({
        name: "download_requests_total",
        help: "Total /api/download requests, labeled by HTTP status and reason",
        labelNames: ["status", "reason"],
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

    return { register, downloadRequestsTotal, downloadJobsTotal, downloadJobDurationSeconds };
}

const metrics = globalRef.__downloadMusicMetrics ?? (globalRef.__downloadMusicMetrics = createMetrics());

export const register = metrics.register;
export const downloadRequestsTotal = metrics.downloadRequestsTotal;
export const downloadJobsTotal = metrics.downloadJobsTotal;
export const downloadJobDurationSeconds = metrics.downloadJobDurationSeconds;
