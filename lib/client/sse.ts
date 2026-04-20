import type { ProgressEvent } from "@/lib/types";

export interface SseHandlers {
  onProgress: (ev: ProgressEvent) => void;
  onDone: (ev: {
    stage: "complete" | "failed";
    result?: unknown;
    error?: string;
  }) => void;
}

export function subscribeJob(jobId: string, handlers: SseHandlers): () => void {
  const es = new EventSource(`/api/progress/${jobId}`);
  es.onmessage = (msg) => {
    try {
      handlers.onProgress(JSON.parse(msg.data) as ProgressEvent);
    } catch {
      // Ignore malformed chunks — server guarantees JSON but be defensive.
    }
  };
  es.addEventListener("done", (msg: MessageEvent) => {
    try {
      handlers.onDone(
        JSON.parse(msg.data) as {
          stage: "complete" | "failed";
          result?: unknown;
          error?: string;
        },
      );
    } catch {
      // Ignore parse errors.
    }
    es.close();
  });
  es.onerror = () => {
    es.close();
  };
  return () => es.close();
}
