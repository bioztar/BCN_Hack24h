import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gamePlugin } from "@dg-roast/game";
import { describe, expect, it } from "vitest";
import { makeApp } from "./helpers.js";

function arcadeApp() {
  const dir = mkdtempSync(path.join(tmpdir(), "roast-arcade-"));
  for (const [rel, body] of [["game/index.html", "ARCADE"], ["game/whack/index.html", "WHACK"], ["swipe/index.html", "SWIPE"]] as const) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), body);
  }
  const webDirs = { game: path.join(dir, "game"), swipe: path.join(dir, "swipe"), flappy: path.join(dir, "flappy-missing") };
  return makeApp({ arcade: { plugin: gamePlugin, options: { dbFile: path.join(dir, "game.sqlite"), secret: "test" }, webDirs } }).app;
}

describe("arcade wiring", () => {
  it("mounts gamePlugin at /api/game", async () => {
    const app = arcadeApp();
    const start = await app.inject({ method: "GET", url: "/api/game/start?game=whack" });
    expect(start.statusCode).toBe(200);
    expect(start.json()).toMatchObject({ game: "whack" });
    const lb = await app.inject({ method: "GET", url: "/api/game/leaderboard?game=swipe" });
    expect(lb.json()).toMatchObject({ game: "swipe", entries: [] });
  });

  it("serves game builds with SPA fallback; missing dirs are skipped", async () => {
    const app = arcadeApp();
    expect((await app.inject({ method: "GET", url: "/game/" })).payload).toBe("ARCADE");
    expect((await app.inject({ method: "GET", url: "/game/whack/?embed=1" })).payload).toBe("WHACK");
    expect((await app.inject({ method: "GET", url: "/swipe/" })).payload).toBe("SWIPE");
    expect((await app.inject({ method: "GET", url: "/swipe/deep/link" })).payload).toBe("SWIPE");
    expect((await app.inject({ method: "GET", url: "/flappy/" })).statusCode).toBe(404);
  });

  it("301s the no-slash forms, keeping the query", async () => {
    const app = arcadeApp();
    for (const [from, to] of [["/game", "/game/"], ["/game/whack?embed=1", "/game/whack/?embed=1"], ["/swipe", "/swipe/"], ["/flappy?mock=1", "/flappy/?mock=1"], ["/triplicate", "/triplicate/"]]) {
      const r = await app.inject({ method: "GET", url: from });
      expect(r.statusCode, from).toBe(301);
      expect(r.headers.location).toBe(to);
    }
  });
});
