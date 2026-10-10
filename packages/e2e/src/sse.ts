export interface SseRead<T = Record<string, unknown>> {
  status: number;
  contentType: string;
  events: (T & { _at: number })[];
  /** ms from request start to the stream ending (or the deadline). */
  ms: number;
  timedOut: boolean;
}

/**
 * Reads an SSE response (`data: {json}` messages; `event:` names are kept as `_event`) until the
 * server closes it, `stop` returns true, or `maxMs` passes. `_at` is ms since the request started.
 */
export async function readSse<T = Record<string, unknown>>(url: string, maxMs: number, stop?: (e: T, all: T[]) => boolean): Promise<SseRead<T>> {
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), maxMs);
  const events: (T & { _at: number })[] = [];
  let status = 0;
  let contentType = "";
  let timedOut = false;
  try {
    const res = await fetch(url, { headers: { accept: "text/event-stream" }, signal: ctl.signal });
    status = res.status;
    contentType = res.headers.get("content-type") ?? "";
    if (!res.body) return { status, contentType, events, ms: Date.now() - t0, timedOut };
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let name = "";
    let data: string[] = [];
    outer: for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        if (line === "") {
          if (data.length) {
            try {
              const obj = JSON.parse(data.join("\n")) as T;
              const ev = Object.assign(obj as object, { _at: Date.now() - t0, ...(name ? { _event: name } : {}) }) as T & { _at: number };
              events.push(ev);
              if (stop?.(obj, events)) {
                ctl.abort();
                break outer;
              }
            } catch {
              /* non-JSON message: ignored, like the clients do */
            }
          }
          name = "";
          data = [];
        } else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
        else if (line.startsWith("event:")) name = line.slice(6).trim();
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") timedOut = Date.now() - t0 >= maxMs - 5;
    else throw err;
  } finally {
    clearTimeout(timer);
  }
  return { status, contentType, events, ms: Date.now() - t0, timedOut };
}
