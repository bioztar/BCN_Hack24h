import type { RoastEvent, WallEntry } from "./contract";

export interface SseMessage {
  event: string;
  data: string;
}

/** Incremental text/event-stream parser: feed it decoded chunks, get whole messages back. */
export class SseParser {
  private buf = "";
  private event = "";
  private data: string[] = [];

  feed(chunk: string): SseMessage[] {
    this.buf += chunk;
    const out: SseMessage[] = [];
    let nl: number;
    while ((nl = this.buf.search(/\r\n|\r|\n/)) >= 0) {
      const line = this.buf.slice(0, nl);
      const sepLen = this.buf.startsWith("\r\n", nl) ? 2 : 1;
      if (this.buf[nl] === "\r" && sepLen === 1 && nl === this.buf.length - 1) break;
      this.buf = this.buf.slice(nl + sepLen);
      if (line === "") {
        if (this.data.length) out.push({ event: this.event || "message", data: this.data.join("\n") });
        this.event = "";
        this.data = [];
        continue;
      }
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") this.event = value;
      else if (field === "data") this.data.push(value);
    }
    return out;
  }
}

const ROAST_TYPES = new Set(["officers", "intake", "tier", "line", "verdict", "awaiting", "error"]);

/** Accepts both `data: {"type":…}` and `event: <type>\ndata: {…}` framings. */
export function toRoastEvent(msg: SseMessage): RoastEvent | null {
  let obj: unknown;
  try {
    obj = JSON.parse(msg.data);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  const type = typeof rec.type === "string" ? rec.type : msg.event;
  if (!ROAST_TYPES.has(type)) return null;
  return { ...rec, type } as RoastEvent;
}

export function toWallEntry(msg: SseMessage): WallEntry[] {
  let obj: unknown;
  try {
    obj = JSON.parse(msg.data);
  } catch {
    return [];
  }
  const list = Array.isArray(obj) ? obj : [obj];
  return list.filter(
    (e): e is WallEntry =>
      !!e && typeof e === "object" && typeof (e as WallEntry).speaker === "string" && typeof (e as WallEntry).text === "string",
  );
}

/** Reads an SSE response body until it ends or `signal` aborts. Resolves on clean end. */
export async function readSse(res: Response, onMessage: (m: SseMessage) => void): Promise<void> {
  if (!res.body) throw new Error("No stream body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const m of parser.feed(decoder.decode(value, { stream: true }))) onMessage(m);
  }
  for (const m of parser.feed(decoder.decode() + "\n\n")) onMessage(m);
}
