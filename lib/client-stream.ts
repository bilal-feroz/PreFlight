import type { ProgressEvent } from "./result-types";

/** POST and read an NDJSON progress stream, one event per line. */
export async function streamEvents(
  url: string,
  body: unknown,
  onEvent: (e: ProgressEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const flush = (line: string) => {
    const t = line.trim();
    if (t) onEvent(JSON.parse(t) as ProgressEvent);
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      flush(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  }
  flush(buf);
}

/**
 * Replays events with a minimum spacing so cached runs (which finish instantly)
 * still show the Creative DNA threads and stages arriving one by one.
 */
export function pacedEmitter(onEvent: (e: ProgressEvent) => void, gapMs = 420) {
  const queue: ProgressEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = 0;
  const pump = () => {
    timer = null;
    const e = queue.shift();
    if (!e) return;
    onEvent(e);
    last = Date.now();
    if (queue.length) {
      const next = queue[0];
      const hidden = typeof document !== "undefined" && document.hidden;
      const gap = hidden ? 0 : next.type === "progress" ? 45 : next.type === "result" || next.type === "reroute" ? gapMs * 2 : gapMs;
      timer = setTimeout(pump, gap);
    }
  };
  return {
    push(e: ProgressEvent) {
      // coalesce consecutive progress events of the same stage while catching up
      const tail = queue[queue.length - 1];
      if (e.type === "progress" && tail?.type === "progress" && tail.stage === e.stage) queue[queue.length - 1] = e;
      else queue.push(e);
      if (!timer) timer = setTimeout(pump, Math.max(0, gapMs - (Date.now() - last)));
    },
    cancel() {
      if (timer) clearTimeout(timer);
      queue.length = 0;
    },
  };
}
