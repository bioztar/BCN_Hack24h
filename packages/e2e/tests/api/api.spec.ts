import { test, expect, type APIRequestContext } from "@playwright/test";
import { liveGate, takeLiveCase } from "../../src/budget";
import { BASE_URL, PITCH, REPLIES, ROUND_MS, TIER_NAMES, WARDEN_URL } from "../../src/env";
import { pngSize, selfieDataUrl } from "../../src/png";
import { routeMissing } from "../../src/routes";
import { readSse } from "../../src/sse";

type Ev = Record<string, any> & { type: string; _at: number };
const V1 = ["officers", "intake", "tier", "line", "audio", "verdict", "awaiting", "meanwhile", "error"];
const V2 = ["fine", "meltdown", "analyzing"];
const CLIPS = ["idle", "listening", "talking", "intro", "tier1", "tier2", "tier3", "tier4", "tier5", "stamp", "asleep", "repo-horror", "verdict"];
const STILLS = ["neutral", "stamping", "smug", "appalled", "asleep"];
const STAMPS = ["REFUSÉ", "INCOMPLET", "RENVOYÉ EN COMMISSION"];

function expectProvision(p: any) {
  expect(p).toEqual(expect.objectContaining({ id: expect.any(String), label: expect.any(String), title: expect.any(String), url: expect.stringMatching(/^https:\/\//) }));
}
function expectMeanwhile(m: any) {
  expect(m.elapsedSec).toEqual(expect.any(Number));
  expect(m.china).toEqual(expect.objectContaining({ models: expect.any(Number), note: expect.any(String) }));
  expect(m.us).toEqual(expect.objectContaining({ models: expect.any(Number), note: expect.any(String) }));
  expect(m.eu).toEqual(expect.objectContaining({ regulations: expect.any(Number), forms: expect.any(Number), note: expect.any(String) }));
}

function expectEntry(e: any) {
  expect(e).toEqual(expect.objectContaining({ caseId: expect.any(String), startupName: expect.any(String), totalEur: expect.any(Number), totalJailMonths: expect.any(Number), meltdown: expect.any(Boolean), issuedAt: expect.any(String) }));
  for (const k of ["founderName", "oneLiner", "photoUrl"]) expect(e[k] === null || typeof e[k] === "string", `${k} string|null`).toBe(true);
  expect(e.topLaws).toEqual(expect.any(Array));
  expect(e.topLaws.length).toBeLessThanOrEqual(3);
}

let personaIds: string[] = [];
async function personas(request: APIRequestContext) {
  if (!personaIds.length) personaIds = ((await (await request.get("/api/personas")).json()) as { id: string }[]).map((p) => p.id);
  return personaIds;
}

test.describe("v1 HTTP shapes", () => {
  test("GET /api/health", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual(expect.objectContaining({ ok: true }));
  });

  test("GET /api/personas → Persona[]", async ({ request }) => {
    const res = await request.get("/api/personas");
    expect(res.status()).toBe(200);
    const list = (await res.json()) as any[];
    expect(list.length).toBeGreaterThanOrEqual(2);
    for (const p of list) {
      expect(p).toEqual(expect.objectContaining({ id: expect.any(String), name: expect.any(String), title: expect.any(String), color: expect.stringMatching(/^#[0-9a-f]{3,8}$/i) }));
      expect(p.stills).toEqual(expect.any(Object));
      for (const k of Object.keys(p.stills)) expect(STILLS, `${p.id} still ${k}`).toContain(k);
      if (p.model3d !== undefined) expect(p.model3d).toEqual(expect.any(String));
      for (const c of Object.keys(p.clips ?? {})) expect(CLIPS, `${p.id} clip ${c}`).toContain(c);
    }
    expect(new Set(list.map((p) => p.id)).size, "persona ids unique").toBe(list.length);
  });

  test("GET /api/pairs → { id, officers: [PersonaId, PersonaId] }[]", async ({ request }) => {
    const ids = await personas(request);
    const res = await request.get("/api/pairs");
    expect(res.status()).toBe(200);
    const pairs = (await res.json()) as any[];
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    for (const p of pairs) {
      expect(p.id).toEqual(expect.any(String));
      expect(p.officers).toHaveLength(2);
      for (const o of p.officers) expect(ids, `pair ${p.id} officer ${o} is a persona`).toContain(o);
    }
  });

  test("POST /api/case rejects a bad submission with 400 (no case created)", async ({ request }) => {
    const res = await request.post("/api/case", { data: { submission: { kind: "text", text: "" } } });
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  test("unknown case → 404 on stream and reply", async ({ request }) => {
    expect((await request.post("/api/case/does-not-exist/reply", { data: { text: "hi" } })).status()).toBe(404);
    const r = await readSse(`${BASE_URL}/api/case/does-not-exist/stream`, 5_000);
    expect(r.status).toBe(404);
  });

  test("GET /api/wall/stream replays officials' lines", async ({ request }) => {
    const ids = await personas(request);
    const r = await readSse<Ev>(`${BASE_URL}/api/wall/stream`, 4_000, (_e, all) => all.length >= 5);
    expect(r.status).toBe(200);
    expect(r.contentType).toMatch(/text\/event-stream/);
    test.skip(!r.events.length, "wall has no entries yet (fresh deploy)");
    for (const e of r.events) {
      expect(e).toEqual(expect.objectContaining({ speaker: expect.any(String), text: expect.any(String), at: expect.any(String) }));
      expect(ids).toContain(e.speaker);
    }
  });

  test("warden: / redirects to /analyze/", async ({ request }) => {
    const res = await request.get(`${WARDEN_URL}/`, { maxRedirects: 0 });
    expect([301, 302, 307, 308]).toContain(res.status());
    expect(res.headers().location).toMatch(/\/analyze\/$/);
  });
});

test.describe("v2 HTTP shapes", () => {
  test("GET /api/leaderboard → { entries, next }", async ({ request }) => {
    const res = await request.get("/api/leaderboard?sort=fines&limit=10");
    test.skip(await routeMissing(res), "server-v2 /api/leaderboard not deployed yet");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual(expect.any(Array));
    for (const e of body.entries) {
      expectEntry(e);
    }
    const fines = body.entries.map((e: any) => e.totalEur);
    expect(body.next === null || typeof body.next === "string").toBe(true);
    expect(fines, "sort=fines is descending").toEqual([...fines].sort((a: number, b: number) => b - a));
  });

  test("POST /api/applicants validates input (400, nothing queued)", async ({ request }) => {
    const res = await request.post("/api/applicants", { data: {} });
    test.skip(await routeMissing(res), "server-v2 /api/applicants not deployed yet");
    expect(res.status()).toBe(400);
  });

  test("arcade API: GET /api/game/leaderboard per game", async ({ request }) => {
    for (const game of ["whack", "swipe", "flappy", "triplicate"]) {
      const res = await request.get(`/api/game/leaderboard?game=${game}`);
      if (await routeMissing(res)) {
        test.skip(true, "arcade /api/game/* not deployed yet");
        return;
      }
      expect(res.status(), game).toBe(200);
      const body = await res.json();
      const entries = Array.isArray(body) ? body : body.entries;
      expect(entries, `${game} leaderboard is a list`).toEqual(expect.any(Array));
    }
  });
});

/** ONE live case for this spec: every SSE + report/badge check below reuses it. */
test.describe.serial("live case contract", () => {
  const live: { caseId?: string; v2: boolean; notice?: any; events: Ev[] } = { v2: false, events: [] };

  test("SSE: 5 rounds of contract events (+ v2 fine/meltdown/meanwhile)", async ({ request }, testInfo) => {
    liveGate(testInfo, "api");
    test.setTimeout(8 * 60_000);
    const ids = await personas(request);
    live.v2 = !(await routeMissing(await request.post("/api/applicants", { data: {} })));
    takeLiveCase(testInfo, "api");

    let applicantId: string | undefined;
    let applicantToken: string | undefined;
    if (live.v2) {
      await test.step("v2: register applicant + better-place skip", async () => {
        const res = await request.post("/api/applicants", { data: { startupName: "Rehearsal GmbH (QA API)", founderName: "Playwright", oneLiner: "Facial honesty scoring for landlords.", photo: selfieDataUrl() } });
        expect(res.status(), await res.text()).toBeLessThan(300);
        const t = await res.json();
        expect(t).toEqual(expect.objectContaining({ applicantId: expect.any(String), applicantToken: expect.any(String), ticket: expect.any(Number), position: expect.any(Number), etaText: expect.stringMatching(/Estimated decision/i), countdownSec: expect.any(Number) }));
        expect(t.applicantToken.length, "token is 32+ bytes base64url").toBeGreaterThanOrEqual(43);
        expect(t.countdownSec).toBeGreaterThanOrEqual(30);
        expect(t.countdownSec).toBeLessThanOrEqual(60);
        applicantId = t.applicantId;
        applicantToken = t.applicantToken;
        const forged = await request.post(`/api/applicants/${applicantId}/better-place`, { data: { cause: "climate", applicantToken: "nope" } });
        expect(forged.status(), "better-place without the right token").toBe(403);
        const bp = await request.post(`/api/applicants/${applicantId}/better-place`, { data: { cause: "climate", applicantToken } });
        expect(bp.status(), await bp.text()).toBeLessThan(300);
        const b = await bp.json();
        expect(b).toEqual(expect.objectContaining({ position: 1, skipped: expect.any(Number), cause: "climate", quip: expect.any(String) }));
      });
    }

    const res = await request.post("/api/case", { data: { submission: { kind: "text", text: PITCH, revenueEur: 120_000 }, ...(applicantId ? { applicantId, applicantToken } : {}) } });
    expect(res.status(), await res.text()).toBe(201);
    const c = await res.json();
    expect(c).toEqual(expect.objectContaining({ caseId: expect.any(String), ticket: expect.any(Number) }));
    expect(c.officers).toHaveLength(2);
    live.caseId = c.caseId;
    testInfo.annotations.push({ type: "caseId", description: c.caseId });

    let prevTotal = 0;
    for (let round = 1; round <= 5; round++) {
      await test.step(`round ${round}`, async () => {
        const r = await readSse<Ev>(`${BASE_URL}/api/case/${c.caseId}/stream`, 90_000, (e) => e.type === "awaiting" || e.type === "verdict" || e.type === "error");
        expect(r.status).toBe(200);
        expect(r.contentType).toMatch(/text\/event-stream/);
        const types = r.events.map((e) => e.type);
        const firstLine = r.events.find((e) => e.type === "line");
        const done = r.events.at(-1);
        testInfo.annotations.push({ type: `round ${round}`, description: `${r.ms} ms, first line ${firstLine?._at ?? "-"} ms, events: ${types.join(",")}` });
        expect(types, "no error event").not.toContain("error");
        expect(r.timedOut, "round finished").toBe(false);
        expect.soft(r.ms, `round ${round} ≤ ${ROUND_MS} ms`).toBeLessThanOrEqual(ROUND_MS);
        expect.soft(firstLine?._at ?? Infinity, "first line within ~6 s").toBeLessThanOrEqual(7_500);
        for (const t of types) expect.soft([...V1, ...V2], `known event type ${t}`).toContain(t);
        live.events.push(...r.events);

        if (round === 1) {
          const off = r.events.find((e) => e.type === "officers");
          expect(off, "round 1 opens with officers").toBeTruthy();
          expect(off!.officers.map((o: any) => o.id)).toEqual(c.officers);
          expect(off!.ticket).toBe(c.ticket);
        }
        const tier = r.events.find((e) => e.type === "tier");
        expect(tier, "tier event").toEqual(expect.objectContaining({ tier: round, name: TIER_NAMES[round - 1] }));
        const lines = r.events.filter((e) => e.type === "line");
        expect(lines.length, "≥ 1 line per round").toBeGreaterThanOrEqual(1);
        for (const l of lines) {
          expect(l).toEqual(expect.objectContaining({ id: expect.any(String), text: expect.any(String) }));
          expect(c.officers).toContain(l.speaker);
          expect(ids).toContain(l.speaker);
          expect(CLIPS).toContain(l.clip);
          expect(l.audioUrl === null || typeof l.audioUrl === "string").toBe(true);
          if (l.stamp !== undefined) expect(STAMPS).toContain(l.stamp);
          l.provisions.forEach(expectProvision);
        }
        const lineIds = new Set(lines.map((l) => l.id));
        for (const a of r.events.filter((e) => e.type === "audio")) {
          expect(lineIds, "audio refers to a line of this round").toContain(a.id);
          expect(a.audioUrl).toEqual(expect.any(String));
        }
        for (const m of r.events.filter((e) => e.type === "meanwhile")) expectMeanwhile(m.meanwhile);
        for (const f of r.events.filter((e) => e.type === "fine")) {
          expect(f).toEqual(expect.objectContaining({ id: expect.any(String), amountEur: expect.any(Number), jailMonths: expect.any(Number), totalEur: expect.any(Number), totalJailMonths: expect.any(Number), caption: expect.any(String) }));
          expectProvision(f.provision);
          expect(f.totalEur, "fine totals are cumulative").toBeGreaterThanOrEqual(prevTotal);
          prevTotal = f.totalEur;
        }
        if (round < 5) {
          expect(done?.type).toBe("awaiting");
          expect(done?.prompt).toEqual(expect.any(String));
          const rep = await request.post(`/api/case/${c.caseId}/reply`, { data: { text: REPLIES[round - 1] ?? "No." } });
          expect(rep.status()).toBe(204);
        } else {
          expect(done?.type).toBe("verdict");
          live.notice = done!.notice;
        }
      });
    }

    const n = live.notice;
    expect(n).toEqual(expect.objectContaining({ serial: expect.any(String), startup: expect.any(String), fineEur: expect.any(Number), fineBasis: expect.any(String), issuedAt: expect.any(String) }));
    expect(Number.isNaN(Date.parse(n.issuedAt))).toBe(false);
    expect(n.findings.length).toBeGreaterThanOrEqual(1);
    for (const f of n.findings) expectProvision(f.provision);
    expect(n.officers).toEqual(c.officers);
    expect((await request.post(`/api/case/${c.caseId}/reply`, { data: { text: "late" } })).status(), "reply after verdict").toBe(409);

    if (live.v2) {
      await test.step("v2 notice + events", async () => {
        expect(n).toEqual(expect.objectContaining({ applicantId, startupName: expect.any(String), totalEur: expect.any(Number), totalJailMonths: expect.any(Number), meltdown: expect.any(Boolean), reportUrl: expect.any(String), badgeUrl: expect.any(String) }));
        expect(n.tldr).toEqual(expect.any(Array));
        expect(n.recommendations).toEqual(expect.any(Array));
        const fines = live.events.filter((e) => e.type === "fine");
        expect(fines.length, "v2 case streams fine events").toBeGreaterThanOrEqual(1);
        expect(n.totalEur).toBe(fines.at(-1)!.totalEur);
        const meltdowns = live.events.filter((e) => e.type === "meltdown");
        expect(meltdowns.length, "at most one meltdown").toBeLessThanOrEqual(1);
        expect(n.meltdown).toBe(meltdowns.length === 1);
        expect(live.events.filter((e) => e.type === "meanwhile").length, "meanwhile ticks while rounds stream").toBeGreaterThanOrEqual(1);
        if (n.meanwhile) expectMeanwhile(n.meanwhile);
      });
    }
  });

  test("GET /api/case/:id/report.pdf → application/pdf", async ({ request }) => {
    test.skip(!live.caseId, "needs the live case above");
    const url = live.notice?.reportUrl ?? `/api/case/${live.caseId}/report.pdf`;
    const res = await request.get(url);
    test.skip(await routeMissing(res), "report.pdf not deployed yet");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^application\/pdf/);
    const body = await res.body();
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(body.length, "report.pdf size").toBeGreaterThan(5_000);
    expect(body.length).toBeLessThan(20_000_000);
  });

  test("GET /api/case/:id/badge.png → 1080×1080 PNG", async ({ request }) => {
    test.skip(!live.caseId, "needs the live case above");
    const url = live.notice?.badgeUrl ?? `/api/case/${live.caseId}/badge.png`;
    const res = await request.get(url);
    test.skip(await routeMissing(res), "badge.png not deployed yet");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^image\/png/);
    expect(pngSize(await res.body())).toEqual({ width: 1080, height: 1080 });
  });

  test("GET /api/leaderboard/:caseId reports the live case", async ({ request }) => {
    test.skip(!live.caseId || !live.v2, "needs a v2 live case");
    const res = await request.get(`/api/leaderboard/${live.caseId}`);
    test.skip(await routeMissing(res), "/api/leaderboard/:caseId not deployed yet");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expectEntry(body.entry);
    expect(body.entry.caseId).toBe(live.caseId);
    expect(body.findings).toEqual(expect.any(Array));
  });
});
