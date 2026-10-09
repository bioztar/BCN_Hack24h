import { describe, expect, it } from "vitest";
import { initialState, reduce, roundOver, type Action, type RoastState } from "../src/reducer";
import type { Notice, Persona } from "../src/types";

const persona = (id: string): Persona => ({ id, name: id, title: "t", stills: {}, color: "#003399" });
const line = (id: string, tier = 1) => ({ type: "line" as const, id, speaker: "formblatt", text: `line ${id} ${tier}`, provisions: [], clip: "talking" as const, audioUrl: null });
const notice: Notice = { serial: "L-2026/00001", startup: "X", officers: ["formblatt", "annexe"], fineEur: 35_000_000, fineBasis: "b", findings: [], issuedAt: "2026-10-10T00:00:00Z" };
const run = (actions: Action[], s: RoastState = initialState) => actions.reduce(reduce, s);

describe("reduce", () => {
  it("runs a full case: submit → stream → awaiting → reply → verdict", () => {
    let s = run([{ type: "submit" }, { type: "case", caseId: "c1", ticket: 4812 }]);
    expect(s.phase).toBe("streaming");
    s = run([{ type: "officers", officers: [persona("formblatt"), persona("annexe")], ticket: 4812 }, { type: "tier", tier: 1, name: "Pre-consultation" }, line("a"), line("b"), { type: "awaiting", prompt: "Do you wish to appeal?" }], s);
    expect(s.officers?.map((p) => p.id)).toEqual(["formblatt", "annexe"]);
    expect(s.lines.length).toBe(2);
    expect(s.phase).toBe("awaiting");
    expect(roundOver(s)).toBe(true);
    s = run([{ type: "round" }], s);
    expect(s.phase).toBe("streaming");
    expect(s.prompt).toBe(null);
    s = run([{ type: "tier", tier: 5, name: "Official Journal" }, line("c", 5), { type: "verdict", notice }], s);
    expect(s.phase).toBe("verdict");
    expect(s.notice?.serial).toBe("L-2026/00001");
    expect(s.lines.length).toBe(3);
  });
  it("dedupes replayed lines and never lowers the tier", () => {
    const s = run([{ type: "tier", tier: 3, name: "Trilogue" }, line("a"), line("a"), { type: "tier", tier: 2, name: "Committee" }]);
    expect(s.lines.length).toBe(1);
    expect(s.tier).toBe(3);
  });
  it("a stream that closes mid-round is an error, but not after the round ended", () => {
    expect(run([{ type: "case", caseId: "c", ticket: 1 }, { type: "closed" }]).phase).toBe("error");
    expect(run([{ type: "case", caseId: "c", ticket: 1 }, { type: "awaiting", prompt: "?" }, { type: "closed" }]).phase).toBe("awaiting");
  });
  it("awaiting after a verdict does not reopen the case", () => {
    expect(run([{ type: "verdict", notice }, { type: "awaiting", prompt: "?" }]).phase).toBe("verdict");
  });
  it("server error events surface their message; reset clears everything", () => {
    const s = run([line("a"), { type: "error", message: "429" }]);
    expect(s).toMatchObject({ phase: "error", error: "429" });
    expect(reduce(s, { type: "reset" })).toEqual(initialState);
  });
});
