import type { ServerResponse } from "node:http";

/** Minimal SSE writer (same framing as the karen reference). */
export class Sse {
  private closed = false;
  constructor(private readonly res: ServerResponse) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write(":\n\n");
    res.on("close", () => (this.closed = true));
  }
  get isClosed(): boolean {
    return this.closed;
  }
  send(event: string, data: unknown): void {
    if (!this.closed) this.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  ping(): void {
    if (!this.closed) this.res.write(": ping\n\n");
  }
  end(): void {
    if (!this.closed) this.res.end();
    this.closed = true;
  }
}

export function parseSse(body: string): { event: string; data: unknown }[] {
  return body
    .split("\n\n")
    .map((block) => {
      const ev = /^event: (.+)$/m.exec(block);
      const data = /^data: (.+)$/m.exec(block);
      return ev && data ? { event: ev[1]!, data: JSON.parse(data[1]!) as unknown } : null;
    })
    .filter((x): x is { event: string; data: unknown } => x !== null);
}
