import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { analyzerPlugin, type AnalyzerOptions } from "../src/plugin.js";
import { GitHubIntake } from "../src/intake/github.js";
import { parseSse } from "../src/sse.js";
import { ReportStore } from "../src/store.js";
import { DESIGN_DOC, FakeLlm, HIRE_REPO, fakeGitHub, makeDocx } from "./fakes.js";

const apps: ReturnType<typeof Fastify>[] = [];
async function make(opts: AnalyzerOptions = {}) {
  const app = Fastify();
  apps.push(app);
  await app.register(analyzerPlugin, { prefix: "/api/analyze", llm: new FakeLlm(), github: new GitHubIntake({ fetchImpl: fakeGitHub(HIRE_REPO).impl, token: () => undefined }), ...opts });
  return app;
}
afterEach(async () => {
  while (apps.length) await apps.pop()!.close();
});

async function waitDone(app: ReturnType<typeof Fastify>, id: string) {
  for (let k = 0; k < 200; k++) {
    const r = await app.inject({ method: "GET", url: `/api/analyze/${id}` });
    if (r.statusCode !== 202) return r;
    await new Promise((res) => setTimeout(res, 10));
  }
  throw new Error("timeout");
}

describe("analyzerPlugin", () => {
  it("POST → stream → .md for an idea", async () => {
    const app = await make();
    const post = await app.inject({ method: "POST", url: "/api/analyze", payload: { kind: "idea", text: "An AI assistant that scores CVs and ranks applicants for EU employers." } });
    expect(post.statusCode).toBe(202);
    const { reportId } = post.json() as { reportId: string };
    expect((await waitDone(app, reportId)).statusCode).toBe(200);
    const stream = await app.inject({ method: "GET", url: `/api/analyze/${reportId}/stream` });
    expect(stream.headers["content-type"]).toContain("text/event-stream");
    const events = parseSse(stream.body);
    expect(events.filter((e) => e.event === "stage").length).toBe(10);
    expect(events.at(-1)?.event).toBe("report");
    const md = await app.inject({ method: "GET", url: `/api/analyze/${reportId}.md` });
    expect(md.statusCode).toBe(200);
    expect(md.headers["content-type"]).toContain("text/markdown");
    expect(md.body).toContain("# Compliance readiness report");
    expect(md.body).toMatch(/Not legal advice/);
  });

  it("accepts a multipart .docx upload", async () => {
    const app = await make();
    const boundary = "----warden";
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\ncontent-disposition: form-data; name="kind"\r\n\r\ndocument\r\n--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="doc.docx"\r\ncontent-type: application/octet-stream\r\n\r\n`),
      makeDocx(DESIGN_DOC),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const post = await app.inject({ method: "POST", url: "/api/analyze", payload: body, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } });
    expect(post.statusCode).toBe(202);
    const r = await waitDone(app, (post.json() as { reportId: string }).reportId);
    expect((r.json() as { kind: string }).kind).toBe("document");
  });

  it("rejects bad input synchronously", async () => {
    const app = await make();
    expect((await app.inject({ method: "POST", url: "/api/analyze", payload: { kind: "repo", repoUrl: "https://gitlab.com/a/b" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/analyze", payload: { kind: "nope" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/analyze/nope/stream" })).statusCode).toBe(404);
  });

  it("fails naming NEBIUS_API_KEY when no key is configured", async () => {
    const app = Fastify();
    apps.push(app);
    await app.register(analyzerPlugin, { prefix: "/api/analyze", env: {} });
    const r = await app.inject({ method: "POST", url: "/api/analyze", payload: { kind: "idea", text: "An AI assistant that scores CVs for employers." } });
    expect(r.statusCode).toBe(503);
    expect(r.json()).toEqual({ error: "NEBIUS_API_KEY is not set" });
  });

  it("rate-limits per IP", async () => {
    const app = await make({ rateLimit: { limit: 1, windowMs: 60_000 } });
    const payload = { kind: "idea", text: "An AI assistant that scores CVs for employers." };
    expect((await app.inject({ method: "POST", url: "/api/analyze", payload })).statusCode).toBe(202);
    const second = await app.inject({ method: "POST", url: "/api/analyze", payload });
    expect(second.statusCode).toBe(429);
    expect(second.headers["retry-after"]).toBeDefined();
  });

  it("defaults to 40 analyses per IP per 10 min (shared venue IP), configurable via env", async () => {
    const payload = { kind: "idea", text: "An AI assistant that scores CVs for employers." };
    const app = await make();
    for (let k = 0; k < 40; k++) expect((await app.inject({ method: "POST", url: "/api/analyze", payload })).statusCode).toBe(202);
    expect((await app.inject({ method: "POST", url: "/api/analyze", payload })).statusCode).toBe(429);
    const small = await make({ env: { ANALYZER_RATE_LIMIT: "2" } });
    for (let k = 0; k < 2; k++) expect((await small.inject({ method: "POST", url: "/api/analyze", payload })).statusCode).toBe(202);
    expect((await small.inject({ method: "POST", url: "/api/analyze", payload })).statusCode).toBe(429);
  });

  it("expires reports after the TTL", () => {
    let t = 0;
    const store = new ReportStore(60 * 60 * 1000, () => t);
    const job = store.create();
    t = 59 * 60 * 1000;
    expect(store.get(job.id)).toBeDefined();
    t = 61 * 60 * 1000;
    expect(store.get(job.id)).toBeUndefined();
    store.close();
  });
});
