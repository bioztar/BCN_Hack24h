import type { AnyRoastEvent } from "./types";

export interface SseMessage { event: string; data: string; }

/** Incremental text/event-stream parser (chunks may split anywhere). */
export class SseParser {
  private buf = "";
  private event = "";
  private data: string[] = [];

  push(chunk: string): SseMessage[] {
    this.buf += chunk;
    const out: SseMessage[] = [];
    let nl: number;
    while ((nl = this.buf.search(/\r\n|\r|\n/)) >= 0) {
      const line = this.buf.slice(0, nl);
      const sepLen = this.buf.startsWith("\r\n", nl) ? 2 : 1;
      if (this.buf[nl] === "\r" && sepLen === 1 && nl === this.buf.length - 1) break;
      this.buf = this.buf.slice(nl + sepLen);
      this.line(line, out);
    }
    return out;
  }

  end(): SseMessage[] {
    const out: SseMessage[] = [];
    if (this.buf) this.line(this.buf, out);
    this.buf = "";
    this.line("", out);
    return out;
  }

  private line(line: string, out: SseMessage[]): void {
    if (line === "") {
      if (this.data.length) out.push({ event: this.event || "message", data: this.data.join("\n") });
      this.event = "";
      this.data = [];
      return;
    }
    if (line.startsWith(":")) return;
    const i = line.indexOf(":");
    const field = i < 0 ? line : line.slice(0, i);
    let value = i < 0 ? "" : line.slice(i + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.event = value;
    else if (field === "data") this.data.push(value);
  }
}

const TYPES = new Set(["officers", "intake", "tier", "line", "audio", "verdict", "awaiting", "error", "fine", "meltdown", "analyzing", "meanwhile"]);

/** Turns an SSE message into a RoastEvent; tolerates servers that put the type only in `event:`. */
export function toRoastEvent(msg: SseMessage): AnyRoastEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(msg.data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type : msg.event;
  if (!TYPES.has(type)) return null;
  return { ...obj, type } as AnyRoastEvent;
}
