import { randomUUID } from "node:crypto";
import type { Job, JobStage, ProgressEvent } from "./types";
import { releaseSlot } from "./limits";

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

// Caller must have successfully reserved an inflight slot via reserveSlot()
// before calling createJob. We track the slot on the job so either the
// complete/fail path or the sweep path releases it exactly once.
export function createJob(init: {
  kind: Job["kind"];
  sessionId: string;
  mode?: Job["mode"];
  input?: string;
}): Job {
  const job: Job = {
    id: randomUUID(),
    sessionId: init.sessionId,
    kind: init.kind,
    mode: init.mode,
    input: init.input,
    createdAt: Date.now(),
    stage: "queued",
    progress: [],
    subscribers: new Set(),
    holdsSlot: true,
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
  extras: { note?: string; finalStage?: JobStage } = {},
): void {
  const job = JOBS.get(jobId);
  if (!job) return;
  const finalStage = extras.finalStage ?? "complete";
  job.result = result;
  job.stage = finalStage;
  emit(jobId, {
    stage: finalStage,
    message: "Job complete",
    note: extras.note,
  });
  job.subscribers.clear();
  if (job.holdsSlot) {
    releaseSlot();
    job.holdsSlot = false;
  }
}

export function failJob(jobId: string, error: string): void {
  const job = JOBS.get(jobId);
  if (!job) return;
  job.error = error;
  job.stage = "failed";
  emit(jobId, { stage: "failed", message: error, status: "failed" });
  job.subscribers.clear();
  if (job.holdsSlot) {
    releaseSlot();
    job.holdsSlot = false;
  }
}

/**
 * Scalability: cap the JOBS map by evicting entries older than 2h every 10min.
 * .unref() so the sweeper never blocks Node from exiting.
 */
function sweep(): void {
  const cutoff = Date.now() - TWO_HOURS_MS;
  for (const [id, job] of JOBS) {
    if (job.createdAt < cutoff) {
      for (const fn of job.subscribers) {
        try {
          fn({ jobId: id, stage: "failed", message: "Job expired", status: "failed" });
        } catch {
          // Swallow — one bad subscriber shouldn't block sweep.
        }
      }
      job.subscribers.clear();
      if (job.holdsSlot) {
        releaseSlot();
        job.holdsSlot = false;
      }
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
