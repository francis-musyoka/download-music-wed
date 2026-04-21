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
  // Guarantees onDone fires at most once across all paths (done event, fatal
  // error, caller unsubscribe) so promises waiting on it can't resolve twice
  // or hang forever.
  let doneFired = false;

  es.onmessage = (msg) => {
    try {
      handlers.onProgress(JSON.parse(msg.data) as ProgressEvent);
    } catch {
      // Ignore malformed chunks — server guarantees JSON but be defensive.
    }
  };
  es.addEventListener("done", (msg: MessageEvent) => {
    if (doneFired) return;
    doneFired = true;
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
    // EventSource fires onerror during transient reconnect attempts
    // (readyState === CONNECTING) as well as on fatal failures
    // (readyState === CLOSED). Only the fatal case is terminal — transients
    // self-heal via the browser's auto-reconnect. Without this gate, a
    // single network blip would leave callers awaiting onDone hung forever.
    if (es.readyState === EventSource.CLOSED && !doneFired) {
      doneFired = true;
      handlers.onDone({ stage: "failed", error: "Connection lost" });
    }
  };
  return () => {
    // Caller-initiated unsubscribe. Suppress onDone — the caller is already
    // tearing the subscription down intentionally and doesn't want a stale
    // "failed" event delivered into their UI.
    doneFired = true;
    es.close();
  };
}
