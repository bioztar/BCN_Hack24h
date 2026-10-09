/** A minimal SSE writer over a raw Node response. */
import type { ServerResponse } from "node:http";

export class Sse {
  private closed = false;

  constructor(
    private readonly res: ServerResponse,
    headers: Record<string, string | string[]> = {},
  ) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      ...headers,
    });
    res.write(":\n\n");
    res.on("close", () => {
      this.closed = true;
    });
  }

  get isClosed(): boolean {
    return this.closed;
  }

  send(event: string, data: unknown): void {
    if (this.closed) return;
    this.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  end(): void {
    if (this.closed) return;
    this.closed = true;
    this.res.end();
  }
}

/** Parses a full SSE payload into events; used by tests against `app.inject`. */
export function parseSse(payload: string): { event: string; data: unknown }[] {
  const out: { event: string; data: unknown }[] = [];
  for (const block of payload.split("\n\n")) {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (data) out.push({ event, data: JSON.parse(data) });
  }
  return out;
}
