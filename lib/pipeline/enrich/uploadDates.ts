import { execFile } from "node:child_process";
import type { Track, ProgressEvent } from "../../types.ts";

type OnProgress = (ev: Omit<ProgressEvent, "jobId">) => void;

export async function fetchUploadDates(
  candidates: Track[],
  {
    concurrency = 5,
    onProgress,
  }: { concurrency?: number; onProgress?: OnProgress } = {},
): Promise<void> {
  await fetchUploadDatesWith(candidates, getUploadDateViaYtDlp, { concurrency, onProgress });
}

async function fetchUploadDatesWith(
  candidates: Track[],
  resolve: (videoId: string) => Promise<string>,
  {
    concurrency = 5,
    onProgress,
  }: { concurrency?: number; onProgress?: OnProgress } = {},
): Promise<void> {
  const needs = candidates.filter((c) => c.videoId && !c.uploadDate);
  if (needs.length === 0) return;

  let done = 0;
  onProgress?.({ stage: "enriching-dates", current: 0, total: needs.length });

  const queue = [...needs];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, needs.length) }, async () => {
      while (queue.length) {
        const c = queue.shift()!;
        try {
          c.uploadDate = parseUploadDate(await resolve(c.videoId!));
        } catch {
          // Silent fallback: recencyScore returns 0.3 when uploadDate is undefined.
        }
        done++;
        if (done % 5 === 0 || done === needs.length) {
          onProgress?.({ stage: "enriching-dates", current: done, total: needs.length });
        }
      }
    }),
  );
}

function parseUploadDate(raw: string): string {
  const s = raw.trim();
  if (!/^\d{8}$/.test(s)) throw new Error(`bad upload_date: ${JSON.stringify(raw)}`);
  return s;
}

function getUploadDateViaYtDlp(videoId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      [
        "--skip-download",
        "--no-warnings",
        "--no-playlist",
        "--print", "%(upload_date)s",
        `https://www.youtube.com/watch?v=${videoId}`,
      ],
      { timeout: 10_000, maxBuffer: 64 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout.toString());
      },
    );
  });
}

// Test-only exports. Do NOT re-export from any barrel.
export const __testing = {
  fetchUploadDatesWith,
  parseUploadDate,
};
