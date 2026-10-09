import { describe, expect, it } from "vitest";
import { SseParser, toRoastEvent } from "../src/sse";

describe("SseParser", () => {
  it("parses unnamed data messages split across arbitrary chunks", () => {
    const text = ':\n\ndata: {"type":"tier","tier":1,"name":"Pre-consultation"}\n\ndata: {"type":"awaiting","prompt":"Well?"}\n\n';
    for (const size of [1, 3, 7, text.length]) {
      const p = new SseParser();
      const msgs = [];
      for (let i = 0; i < text.length; i += size) msgs.push(...p.push(text.slice(i, i + size)));
      msgs.push(...p.end());
      expect(msgs.map((m) => toRoastEvent(m)?.type)).toEqual(["tier", "awaiting"]);
    }
  });
  it("handles CRLF, multi-line data and named events", () => {
    const p = new SseParser();
    const msgs = p.push('event: line\r\ndata: {"id":"a",\r\ndata: "speaker":"x"}\r\n\r\n');
    expect(msgs).toEqual([{ event: "line", data: '{"id":"a",\n"speaker":"x"}' }]);
    expect(toRoastEvent(msgs[0]!)?.type).toBe("line");
  });
  it("flushes a final message without a trailing blank line", () => {
    const p = new SseParser();
    expect(p.push('data: {"type":"error","message":"x"}')).toEqual([]);
    expect(p.end().length).toBe(1);
  });
  it("drops junk and unknown types", () => {
    expect(toRoastEvent({ event: "message", data: "not json" })).toBe(null);
    expect(toRoastEvent({ event: "message", data: '{"type":"party"}' })).toBe(null);
  });
});
