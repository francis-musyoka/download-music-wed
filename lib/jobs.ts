import { randomUUID } from "node:crypto";
import type { Job, JobStage, ProgressEvent } from "./types";

// In-memory job store. Bounded by a 2h TTL sweep (see below).
// NOTE: single-process only — this intentionally does not survive restarts.
//
// Hoisted onto globalThis so the map survives Next.js dev-mode module
// re-evaluation and is shared across route handlers (each API route may be
// compiled into its own chunk with its own module instance otherwise).
type GlobalWithJobs = typeof globalThis & {
  __downloadMusicJobs?: Map<string, Job>;
};
const globalRef = globalThis as GlobalWithJobs;
const JOBS: Map<string, Job> =
  globalRef.__downloadMusicJobs ?? (globalRef.__downloadMusicJobs = new Map());

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

export function createJob(init: {
  kind: Job["kind"];
  mode?: Job["mode"];
  input?: string;
}): Job {
  const job: Job = {
    id: randomUUID(),
    kind: init.kind,
    mode: init.mode,
    input: init.input,
    createdAt: Date.now(),
    stage: "queued",
    progress: [],
    subscribers: new Set(),
  };
  JOBS.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return JOBS.get(id);
}

/**
 * Record a progress event on the job (history) and fan out to subscribers.
 * Keeps stage in sync with the latest event.
 */
export function emit(jobId: string, ev: Omit<ProgressEvent, "jobId">): void {
  const job = JOBS.get(jobId);
  if (!job) return;

  const full: ProgressEvent = { ...ev, jobId };
  job.progress.push(full);
  job.stage = ev.stage;

  for (const fn of job.subscribers) {
    try {
      fn(full);
    } catch {
      // Never let a faulty subscriber break the emit loop.
    }
  }
}

/**
 * Subscribe to a job's progress stream. Late subscribers receive the full
 * history replay synchronously, so a browser that reconnects mid-job catches up.
 * Returns an unsubscribe function.
 */
export function subscribe(
  jobId: string,
  fn: (ev: ProgressEvent) => void,
): () => void {
  const job = JOBS.get(jobId);
  if (!job) return () => {};

  // Replay existing history so late subscribers catch up.
  for (const ev of job.progress) {
    try {
      fn(ev);
    } catch {
      // Swallow — one bad subscriber shouldn't abort replay.
    }
  }

  job.subscribers.add(fn);
  return () => {
    job.subscribers.delete(fn);
  };
}

export function completeJob(
  jobId: string,
  result: Job["result"],
  finalStage: JobStage = "complete",
): void {
  const job = JOBS.get(jobId);
  if (!job) return;
  job.result = result;
  job.stage = finalStage;
  emit(jobId, { stage: finalStage, message: "Job complete" });
  // Release subscribers so they can be GC'd.
  job.subscribers.clear();
}

export function failJob(jobId: string, error: string): void {
  const job = JOBS.get(jobId);
  if (!job) return;
  job.error = error;
  job.stage = "failed";
  emit(jobId, { stage: "failed", message: error, status: "failed" });
  job.subscribers.clear();
}

/**
 * Scalability: cap the JOBS map by evicting entries older than 2h every 10min.
 * .unref() so the sweeper never blocks Node from exiting.
 */
function sweep(): void {
  const cutoff = Date.now() - TWO_HOURS_MS;
  for (const [id, job] of JOBS) {
    if (job.createdAt < cutoff) {
      job.subscribers.clear();
      JOBS.delete(id);
    }
  }
}

// Guard against double-registration under dev/HMR reloads.
type GlobalWithSweeper = typeof globalThis & {
  __downloadMusicJobSweeper?: NodeJS.Timeout;
};
const g = globalThis as GlobalWithSweeper;
if (!g.__downloadMusicJobSweeper) {
  const interval = setInterval(sweep, TEN_MINUTES_MS);
  interval.unref?.();
  g.__downloadMusicJobSweeper = interval;
}
