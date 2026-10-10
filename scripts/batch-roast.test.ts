import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeTts, makeApp } from "../packages/server/test/helpers.ts";
import { parseCsv, parseRows, runBatch, table } from "./batch-roast.ts";

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "projects.csv");

describe("batch-roast parsing", () => {
  it("parses quoted CSV and JSON", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
    const rows = parseRows(readFileSync(FIXTURE, "utf8"));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ project: "FaceFeel", oneLiner: "Webcams read employees' emotions at work, all day" });
    expect(rows[2]!.repoUrl).toBe("https://github.com/acme/fridgely");
    expect(parseRows('[{"project":"A","oneLiner":"b"}]', "p.json")).toEqual([{ project: "A", oneLiner: "b" }]);
  });
});

describe("batch-roast against a server", () => {
  const tts = new FakeTts();
  const { app } = makeApp({ llm: null, tts, expressMode: true });
  let base = "";
  beforeAll(async () => {
    await app.listen({ host: "127.0.0.1", port: 0 });
    const a = app.server.address();
    base = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
  });
  afterAll(() => app.close());

  it("3 rows → silent express verdicts, event-tagged and on the normal leaderboard", async () => {
    const results = await runBatch(parseRows(readFileSync(FIXTURE, "utf8")), { base, event: "bcn-hack-24h" });
    expect(results.map((r) => r.error)).toEqual([undefined, undefined, undefined]);
    for (const r of results) {
      expect(r.caseId).toBeTruthy();
      expect(r.totalEur).toBeGreaterThan(0);
      expect(r.topLaws.length).toBeGreaterThan(0);
    }
    expect(tts.calls).toBe(0);
    const t = table(results);
    for (const p of ["FaceFeel", "Chessly", "Fridgely", "totalEur", "top laws"]) expect(t).toContain(p);

    const tagged = (await (await fetch(`${base}/api/leaderboard?event=bcn-hack-24h`)).json()) as { entries: { caseId: string; event?: string; founderName: string | null }[] };
    expect(tagged.entries).toHaveLength(3);
    expect(tagged.entries.every((e) => e.event === "bcn-hack-24h" && e.founderName === null)).toBe(true);
    const all = (await (await fetch(`${base}/api/leaderboard`)).json()) as { entries: { caseId: string }[] };
    for (const r of results) expect(all.entries.map((e) => e.caseId)).toContain(r.caseId);
    expect(((await (await fetch(`${base}/api/leaderboard?event=other`)).json()) as { entries: unknown[] }).entries).toHaveLength(0);
    expect(((await (await fetch(`${base}/api/stats?event=bcn-hack-24h`)).json()) as { refusedToday: number }).refusedToday).toBe(3);
    expect(((await (await fetch(`${base}/api/stats?event=other`)).json()) as { refusedToday: number }).refusedToday).toBe(0);
    expect((await fetch(`${base}/api/leaderboard?event=Not%20A%20Slug`)).status).toBe(400);
    expect((await fetch(`${base}/api/stats?event=Not%20A%20Slug`)).status).toBe(400);
  }, 60_000);

  it("founderName stays required without an event", async () => {
    const r = await fetch(`${base}/api/applicants`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ startupName: "X" }) });
    expect(r.status).toBe(400);
  });
});
