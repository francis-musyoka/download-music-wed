import { getJob, subscribe } from "@/lib/jobs";
import { readSession } from "@/lib/session";
import type { ProgressEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  const job = getJob(jobId);
  if (!job) {
    return new Response("Not found", { status: 404 });
  }

  const session = readSession(req);
  if (!session || session !== job.sessionId) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const safeClose = (): void => {
        if (closed) return;
        closed = true;
        if (unsubscribe) {
          const fn = unsubscribe;
          unsubscribe = null;
          fn();
        }
        try {
          controller.close();
        } catch {
          // Already closed — ignore.
        }
      };

      const send = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Consumer detached mid-write; ensure we release subscribers.
          safeClose();
        }
      };

      unsubscribe = subscribe(jobId, (ev: ProgressEvent) => {
        if (closed) return;

        send(`data: ${JSON.stringify(ev)}\n\n`);

        if (ev.stage === "complete" || ev.stage === "failed") {
          const snapshot = getJob(jobId);
          const final = {
            stage: ev.stage,
            result: snapshot?.result,
            error: snapshot?.error,
          };
          send(`event: done\ndata: ${JSON.stringify(final)}\n\n`);
          safeClose();
        }
      });

      // If the job already terminated before subscribe (replay delivered the
      // final event synchronously), safeClose has already run. Nothing else to
      // do here — the reader will observe the closed stream.
    },
    cancel() {
      // Browser navigated away / aborted fetch — release the subscriber so
      // it doesn't leak in the job's Set forever.
      if (unsubscribe) {
        const fn = unsubscribe;
        unsubscribe = null;
        fn();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
