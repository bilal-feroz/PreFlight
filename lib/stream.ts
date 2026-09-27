import type { ProgressEvent } from "./result-types";

/** NDJSON progress stream for long pipeline runs. */
export function ndjsonStream(run: (emit: (e: ProgressEvent) => void) => Promise<ProgressEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (e: ProgressEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false;
        }
      };
      // keep proxies from closing an idle connection during slow LLM batches
      const ping = setInterval(() => {
        if (open) {
          try {
            controller.enqueue(encoder.encode("\n"));
          } catch {
            open = false;
          }
        }
      }, 10_000);
      try {
        emit(await run(emit));
      } catch (e) {
        console.error("[pipeline]", e);
        emit({ type: "error", message: e instanceof Error ? e.message : "Something went wrong" });
      } finally {
        clearInterval(ping);
        open = false;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
