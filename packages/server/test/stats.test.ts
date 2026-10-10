import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { parseSse } from "../src/sse.js";
import { StatsHub, brusselsMidnight, type LiveCase, type Stats } from "../src/stats.js";
import { makeApp } from "./helpers.js";

type App = ReturnType<typeof makeApp>["app"];
const get = async <T,>(app: App, url: string) => (await app.inject({ method: "GET", url })).json() as T;

describe("stage feeds", () => {
  it("day starts at midnight Brussels (CEST and CET)", () => {
    expect(new Date(brusselsMidnight(Date.parse("2026-10-10T08:30:12.345Z"))).toISOString()).toBe("2026-10-09T22:00:00.000Z");
    expect(new Date(brusselsMidnight(Date.parse("2026-12-01T23:30:00.000Z"))).toISOString()).toBe("2026-12-01T23:00:00.000Z");
  });

  it("/api/live and /api/stats follow an applicant from queue to verdict", async () => {
    const { app } = makeApp({ llm: null });
    expect(await get<LiveCase>(app, "/api/live")).toEqual({ caseId: null, startedAt: null });
    const empty = await get<Stats>(app, "/api/stats");
    expect(empty).toMatchObject({ inQueue: 0, refusedToday: 0, totalEurToday: 0, totalJailMonthsToday: 0, queue: 0, applicantsToday: 0 });
    expect(empty.meanwhileToday.eu.forms).toBeGreaterThan(0);

    const ticket = (await app.inject({ method: "POST", url: "/api/applicants", payload: { startupName: "Fridgely", founderName: "Ada" } })).json() as { applicantId: string; applicantToken: string };
    expect(await get<Stats>(app, "/api/stats")).toMatchObject({ inQueue: 1, applicantsToday: 1, refusedToday: 0 });

    const created = (await app.inject({ method: "POST", url: "/api/case", payload: { submission: { kind: "text", text: "Uber for fridges with face recognition" }, applicantId: ticket.applicantId, applicantToken: ticket.applicantToken } })).json() as { caseId: string; ticket: number };
    const live = await get<LiveCase>(app, "/api/live");
    expect(live).toMatchObject({ caseId: created.caseId, ticket: created.ticket, startupName: "Fridgely" });
    expect(Date.parse(live.startedAt!)).toBeGreaterThan(Date.now() - 5000);

    for (let t = 1; t <= 5; t++) {
      await app.inject({ method: "GET", url: `/api/case/${created.caseId}/stream` });
      if (t < 5) await app.inject({ method: "POST", url: `/api/case/${created.caseId}/reply`, payload: { text: "Trust us." } });
    }
    expect((await get<LiveCase>(app, "/api/live")).caseId).toBeNull();
    const after = await get<Stats>(app, "/api/stats");
    expect(after).toMatchObject({ inQueue: 0, refusedToday: 1, applicantsToday: 1 });
    expect(after.totalEurToday).toBeGreaterThan(0);
    await app.close();
  });

  it("/api/live picks the newest in-progress case", async () => {
    const { app } = makeApp({ llm: null });
    const mk = async () => ((await app.inject({ method: "POST", url: "/api/case", payload: { submission: { kind: "text", text: "An AI for cats" } } })).json() as { caseId: string }).caseId;
    await mk();
    await new Promise((r) => setTimeout(r, 5));
    const second = await mk();
    expect((await get<LiveCase>(app, "/api/live")).caseId).toBe(second);
    await app.close();
  });

  it("/api/stats/stream sends a snapshot, then pushes on change", async () => {
    const { app } = makeApp({ llm: null });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const ac = new AbortController();
    const res = await fetch(`${base}/api/stats/stream`, { signal: ac.signal });
    const reader = res.body!.getReader();
    let buf = "";
    const next = async (): Promise<Stats> => {
      for (;;) {
        const frames = parseSse(buf);
        if (frames.length) {
          buf = buf.slice(buf.indexOf("\n\n", buf.indexOf("data:")) + 2);
          return frames[0]!.data as Stats;
        }
        const { value } = await reader.read();
        buf += new TextDecoder().decode(value);
      }
    };
    expect((await next()).inQueue).toBe(0);
    await fetch(`${base}/api/applicants`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ startupName: "Fridgely", founderName: "Ada" }) });
    expect((await next()).inQueue).toBe(1);
    ac.abort();
    await app.close();
  });

  it("throttles pushes to at most one per window", async () => {
    const hub = new StatsHub(openDb(":memory:"), Date.now, 100, 60_000);
    const got: Stats[] = [];
    const off = hub.subscribe((s) => got.push(s));
    for (let i = 0; i < 5; i++) hub.changed();
    await new Promise((r) => setTimeout(r, 30));
    expect(got).toHaveLength(1);
    hub.changed();
    await new Promise((r) => setTimeout(r, 30));
    expect(got).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 120));
    expect(got).toHaveLength(2);
    off();
    hub.close();
  });
});
