import { describe, expect, it } from "vitest";
import { SseParser, toRoastEvent, toWallEntry } from "../src/sse";

describe("SseParser", () => {
  it("parses named events split across arbitrary chunks", () => {
    const p = new SseParser();
    const payload = ':\n\nevent: tier\ndata: {"tier":2,"name":"Committee"}\n\nevent: awaiting\r\ndata: {"prompt":"Object."}\r\n\r\n';
    const out = [];
    for (let i = 0; i < payload.length; i += 7) out.push(...p.feed(payload.slice(i, i + 7)));
    expect(out).toEqual([
      { event: "tier", data: '{"tier":2,"name":"Committee"}' },
      { event: "awaiting", data: '{"prompt":"Object."}' },
    ]);
  });

  it("joins multi-line data and ignores comments", () => {
    const p = new SseParser();
    expect(p.feed(": keepalive\ndata: a\ndata: b\n\n")).toEqual([{ event: "message", data: "a\nb" }]);
  });
});

describe("toRoastEvent", () => {
  it("accepts type in the payload or in the event name", () => {
    expect(toRoastEvent({ event: "message", data: '{"type":"tier","tier":3,"name":"Trilogue"}' })).toMatchObject({ type: "tier", tier: 3 });
    expect(toRoastEvent({ event: "awaiting", data: '{"prompt":"x"}' })).toEqual({ type: "awaiting", prompt: "x" });
  });

  it("drops junk and unknown types", () => {
    expect(toRoastEvent({ event: "message", data: "not json" })).toBeNull();
    expect(toRoastEvent({ event: "ping", data: "{}" })).toBeNull();
  });
});

describe("toWallEntry", () => {
  it("accepts a single entry or a backlog array, drops malformed", () => {
    expect(toWallEntry({ event: "message", data: '{"speaker":"annexe","text":"Non.","at":"2026-10-10T10:00:00Z"}' })).toHaveLength(1);
    expect(toWallEntry({ event: "message", data: '[{"speaker":"a","text":"b","at":""},{"nope":1}]' })).toHaveLength(1);
  });
});

describe("late audio", () => {
  it("accepts the unnamed audio event", () => {
    const p = new SseParser();
    const [m] = p.feed('data: {"type":"audio","id":"l1","audioUrl":"/assets/tts/l1.mp3"}\n\n');
    expect(toRoastEvent(m!)).toEqual({ type: "audio", id: "l1", audioUrl: "/assets/tts/l1.mp3" });
  });
});
