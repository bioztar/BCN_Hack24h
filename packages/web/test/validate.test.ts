import { describe, expect, it } from "vitest";
import { cutoutUrl, pickVisual } from "../src/assets";
import { levelFromSamples } from "../src/stage/level";
import type { Persona } from "../src/contract";
import { parseRepoUrl, parseRevenue, quoteClaim } from "../src/validate";

describe("parseRepoUrl", () => {
  it("accepts github.com owner/repo", () => {
    expect(parseRepoUrl("https://github.com/bioztar/warden")?.url).toBe("https://github.com/bioztar/warden");
    expect(parseRepoUrl(" https://github.com/a-b/c.d_e.git/ ")).toMatchObject({ owner: "a-b", repo: "c.d_e" });
  });
  it("rejects other hosts, deeper paths and tricks", () => {
    for (const bad of [
      "http://github.com/a/b",
      "https://gitlab.com/a/b",
      "https://github.com.evil.io/a/b",
      "https://evil.io/?https://github.com/a/b",
      "https://github.com/a/b/tree/main",
      "https://github.com/a",
      "https://user@github.com/a/b",
      "https://github.com/-a/b",
      "https://github.com/a/..",
    ])
      expect(parseRepoUrl(bad), bad).toBeNull();
  });
});

describe("parseRevenue", () => {
  it("parses euros with suffixes and separators", () => {
    expect(parseRevenue("€1,200,000")).toBe(1_200_000);
    expect(parseRevenue("2.5m")).toBe(2_500_000);
    expect(parseRevenue("0")).toBe(0);
    expect(parseRevenue("")).toBeUndefined();
    expect(parseRevenue("lots")).toBeUndefined();
  });
});

describe("pickVisual", () => {
  const p: Persona = { id: "x", name: "X", title: "", color: "#000", stills: { neutral: "/n.png", smug: "/s.png" }, model3d: "/x.glb", clips: { talking: "/t.mp4" } };
  const bare = { ...p, model3d: undefined, clips: undefined };
  it("uses optional clip → bust only when present, else the puppet", () => {
    expect(pickVisual(p, "talking", "smug", () => false)).toEqual({ kind: "clip", url: "/t.mp4", loop: true });
    expect(pickVisual(p, "stamp", "stamping", () => false)).toEqual({ kind: "bust", url: "/x.glb" });
    expect(pickVisual(bare, "talking", "smug", () => false).kind).toBe("puppet");
  });
  it("orders puppet images cut-out → still → neutral, skipping broken ones", () => {
    expect(pickVisual(bare, "stamp", "smug", () => false)).toEqual({ kind: "puppet", images: [cutoutUrl("x", "smug"), "/s.png", cutoutUrl("x", "neutral"), "/n.png"] });
    expect(pickVisual(bare, "stamp", "appalled", (u) => !!u?.includes("cutout"))).toEqual({ kind: "puppet", images: ["/n.png", "/s.png"] });
    expect(pickVisual({ ...bare, stills: {} }, "idle", "neutral", (u) => !!u?.includes("cutout"))).toEqual({ kind: "puppet", images: [] });
  });
});

describe("levelFromSamples", () => {
  it("is 0 for silence and grows with amplitude, capped at 1", () => {
    expect(levelFromSamples(new Uint8Array(256).fill(128))).toBe(0);
    const quiet = levelFromSamples(Uint8Array.from({ length: 256 }, (_, i) => 128 + (i % 2 ? 6 : -6)));
    const loud = levelFromSamples(Uint8Array.from({ length: 256 }, (_, i) => 128 + (i % 2 ? 60 : -60)));
    expect(quiet).toBeGreaterThan(0);
    expect(loud).toBeGreaterThan(quiet);
    expect(levelFromSamples(Uint8Array.from({ length: 256 }, (_, i) => (i % 2 ? 255 : 0)))).toBe(1);
  });
});

describe("quoteClaim", () => {
  it("quotes at most 12 words", () => {
    expect(quoteClaim("Swipely: Tinder for regulatory filings.")).toBe("Swipely: Tinder for regulatory filings");
    expect(quoteClaim("one two three four five six seven eight nine ten eleven twelve thirteen")).toBe("one two three four five six seven eight nine ten eleven twelve…");
    expect(quoteClaim("   ")).toBeNull();
    expect(quoteClaim(undefined)).toBeNull();
  });
});
