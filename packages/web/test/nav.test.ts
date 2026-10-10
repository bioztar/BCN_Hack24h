import { describe, expect, it } from "vitest";
import { firstRun, navHidden, playHref, setNavHidden, stageHref, type KV } from "../src/presenter/nav";
import { parseView } from "../src/presenter/view";

const mem = (): KV & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

describe("presenter nav", () => {
  it("is visible by default and remembers H", () => {
    const s = mem();
    expect(navHidden(s)).toBe(false);
    setNavHidden(s, true);
    expect(navHidden(s)).toBe(true);
    setNavHidden(s, false);
    expect(navHidden(s)).toBe(false);
    expect(navHidden(null)).toBe(false);
  });
  it("shows the first-run tip once", () => {
    const s = mem();
    expect(firstRun(s)).toBe(true);
    expect(firstRun(s)).toBe(false);
    const broken: KV = { getItem: () => { throw new Error("denied"); }, setItem: () => undefined };
    expect(firstRun(broken)).toBe(true);
  });
  it("links to the laptop roast and back, keeping rehearsal mode", () => {
    expect(playHref("")).toBe("/?play=1");
    expect(playHref("?mock=1&view=board")).toBe("/?play=1&mock=1");
    expect(stageHref("?play=1")).toBe("/");
    expect(stageHref("?play=1&mock=1")).toBe("/?mock=1");
  });
  it("parses view names and keys", () => {
    expect(parseView("l")).toBe("board");
    expect(parseView("leaderboard")).toBe("board");
    expect(parseView("arcade")).toBe("arcade");
    expect(parseView(null)).toBe("qr");
  });
});
