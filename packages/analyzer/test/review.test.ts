/** Fix-round regressions: echoed schema ids, stage logging, parallel report stages, counts, severity, model selection, explainer Markdown. */
import { describe, expect, it } from "vitest";
import { analyze, capSecretSeverity, matcher, type Deps, type StageFailure } from "../src/pipeline.js";
import { GitHubIntake, secretFileSeverity } from "../src/intake/github.js";
import { NebiusError, NebiusLlm, type CompleteRequest, type CompleteResult, type Llm } from "../src/llm.js";
import { ProvisionIndex } from "../src/provisions.js";
import { loadSkills, SKILLS_DIR } from "../src/skills.js";
import { DEFAULT_CORPUS } from "../src/plugin.js";
import { mdToHtml } from "../web/src/md.js";
import type { AnalyzeRequest } from "../src/types.js";
import { FakeLlm, HIRE_REPO, fakeGitHub } from "./fakes.js";

const index = ProvisionIndex.load(DEFAULT_CORPUS, SKILLS_DIR);
const skills = loadSkills(index);
const IDEA: AnalyzeRequest = { kind: "idea", text: "HireRank: an LLM assistant that scores CVs and ranks applicants for EU employers, with a candidate chatbot." };
const user = (req: CompleteRequest) => req.messages.at(-1)?.content ?? "";
const itemIds = (req: CompleteRequest) => [...user(req).matchAll(/^ITEM ([A-Z]\d+)/gm)].map((m) => m[1]!);
const exampleId = (req: CompleteRequest) => /"id":\s*"([^"]+)"/.exec(user(req))?.[1];

function deps(llm: Llm, extra: Partial<Deps> = {}): Deps {
  const gh = fakeGitHub(HIRE_REPO);
  return { llm, index, skills, github: new GitHubIntake({ fetchImpl: gh.impl, token: () => undefined }), now: () => new Date("2026-10-10T09:00:00Z"), ...extra };
}

describe("checklist schema example ids", () => {
  it("uses the batch's first real item id, never a hardcoded C1", async () => {
    const llm = new FakeLlm();
    await analyze(IDEA, deps(llm), () => {}, "t");
    const batched = llm.calls.filter((c) => c.stage.startsWith("checklist.") || (c.stage.startsWith("report.") && c.stage !== "report.explainer"));
    expect(batched.length).toBeGreaterThan(3);
    for (const c of batched) expect(exampleId(c)).toBe(itemIds(c)[0]);
  });

  for (const echo of ["example", "C-series"] as const)
    it(`falls back to position when the model echoes ${echo === "example" ? "the example id" : "C1…Cn"} for every entry`, async () => {
      const id = (req: CompleteRequest, k: number) => (echo === "example" ? exampleId(req)! : `C${k + 1}`);
      const checklist = (req: CompleteRequest) => ({ results: itemIds(req).map((_, k) => ({ id: id(req, k), verdict: "FAIL", status: "gap", evidence: `evidence #${k}` })) });
      const report = (req: CompleteRequest) => ({ findings: itemIds(req).map((real, k) => ({ id: id(req, k), title: `T ${real}`, what: "w", why: "y", fix: `Positional fix for ${real}`, effort: "S" })) });
      const llm = new FakeLlm({ "checklist.eu-ai-act": checklist, "checklist.warden": checklist, "report.eu-ai-act": report, "report.warden": report });
      const r = await analyze(IDEA, deps(llm), () => {}, "t");
      expect(r.checklist.some((c) => /Not assessed/.test(c.evidence))).toBe(false);
      expect(r.findings.length).toBeGreaterThan(10);
      for (const f of r.findings) {
        expect(f.fix).not.toMatch(/Address the checklist item/);
        expect(f.fix).toBe(`Positional fix for ${f.sourceItem.split("#")[1]}`);
      }
    });

  it("matcher: unique real ids win, duplicates/unknown ids go positional, another item's id is not stolen", () => {
    const pick = matcher(["A1", "A2", "A3"], [{ id: "A2", n: 0 }, { id: "A2", n: 1 }, { id: "Z9", n: 2 }]);
    expect(pick(0)?.n).toBe(0);
    expect(pick(1)?.n).toBe(1);
    expect(pick(2)?.n).toBe(2);
    const exact = matcher(["A1", "A2"], [{ id: "A2", n: 0 }, { id: "A1", n: 1 }]);
    expect([exact(0)?.n, exact(1)?.n]).toEqual([1, 0]);
    expect(matcher(["A1", "A2"], [{ id: "A2" }])(0)).toBeUndefined();
  });
});

describe("stage failures are logged (stage + error class, no content) and degrade", () => {
  it("logs report.warden failure and still returns a report", async () => {
    const logs: StageFailure[] = [];
    const llm = new FakeLlm({
      "report.warden": () => {
        throw new NebiusError("nebius 503 — SECRET PROMPT CONTENT", 503);
      },
      "checklist.eu-ai-act": () => {
        throw new TypeError("fetch failed SECRET PROMPT CONTENT");
      },
    });
    const r = await analyze(IDEA, deps(llm, { log: (e) => logs.push(e) }), () => {}, "t");
    expect(r.findings.length).toBeGreaterThan(0);
    expect(logs).toContainEqual({ stage: "report.warden", errorClass: "NebiusError", status: 503 });
    expect(logs).toContainEqual({ stage: "checklist.eu-ai-act", errorClass: "TypeError" });
    expect(JSON.stringify(logs)).not.toContain("SECRET");
  });
});

describe("concurrency", () => {
  it("runs the two skills' report stages in parallel and keeps stage events ordered", async () => {
    const fake = new FakeLlm();
    const inFlight = new Set<string>();
    let overlap = false;
    const llm: Llm = {
      async complete(req: CompleteRequest): Promise<CompleteResult> {
        inFlight.add(req.stage);
        if (inFlight.has("report.eu-ai-act") && inFlight.has("report.warden")) overlap = true;
        await new Promise((r) => setTimeout(r, 15));
        inFlight.delete(req.stage);
        return fake.complete(req);
      },
    };
    const events: string[] = [];
    await analyze(IDEA, deps(llm), (e) => e.type === "stage" && events.push(`${e.stage}:${e.status}`), "t");
    expect(overlap).toBe(true);
    expect(events).toEqual(["intake:start", "intake:done", "classify:start", "classify:done", "checklist:start", "checklist:done", "report:start", "report:done", "validate:start", "validate:done"]);
  });
});

describe("validation counts", () => {
  it("counts AI Act references stripped from the warden half separately from unknown ids", async () => {
    const r = await analyze(IDEA, deps(new FakeLlm()), () => {}, "t");
    expect(r.validation.strippedAiAct).toBeGreaterThan(0);
    expect(r.validation.droppedIds).not.toContain("AI Act Art. 6");
    expect(r.validation.droppedIds).toEqual(expect.arrayContaining(["ai-act-fake-1"]));
  });
});

describe("tracked .npmrc severity (filename only)", () => {
  it("is medium; .env and keys stay high", () => {
    expect(secretFileSeverity(".npmrc")).toBe("medium");
    expect(secretFileSeverity("packages/lib/.npmrc")).toBe("medium");
    expect(secretFileSeverity(".env")).toBe("high");
    expect(secretFileSeverity("deploy/key.pem")).toBe("high");
    expect(capSecretSeverity("critical", "A tracked .npmrc is committed.", [".npmrc"])).toBe("medium");
    expect(capSecretSeverity("critical", "Tracked .npmrc and .env files.", [".npmrc", ".env"])).toBe("critical");
    expect(capSecretSeverity("critical", "No secrets handling.", [".npmrc"])).toBe("critical");
    expect(capSecretSeverity("low", ".npmrc", [".npmrc"])).toBe("low");
  });
});

describe("model selection", () => {
  const reply = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  const req = { stage: "x", messages: [{ role: "user" as const, content: "hi" }], maxOutputTokens: 10 };
  function recorder(handler: (model: string) => Response) {
    const models: string[] = [];
    const f = (async (_url: string, init: RequestInit) => {
      const m = String(JSON.parse(String(init.body)).model);
      models.push(m);
      return handler(m);
    }) as unknown as typeof fetch;
    return { models, f };
  }
  it("defaults to DeepSeek-V4-Pro and honours NEBIUS_MODEL", async () => {
    const a = recorder(() => reply("{}"));
    await new NebiusLlm({ NEBIUS_API_KEY: "k" }, a.f).complete(req);
    const b = recorder(() => reply("{}"));
    await new NebiusLlm({ NEBIUS_API_KEY: "k", NEBIUS_MODEL: "custom/model" }, b.f).complete(req);
    expect([a.models, b.models]).toEqual([["deepseek-ai/DeepSeek-V4-Pro"], ["custom/model"]]);
  });
  it("falls back to Kimi-K3 once on 5xx or an empty reply, not on 401", async () => {
    const down = recorder((m) => (m.startsWith("deepseek") ? new Response("busy", { status: 503 }) : reply("{}")));
    await new NebiusLlm({ NEBIUS_API_KEY: "k" }, down.f).complete(req);
    expect(down.models).toEqual(["deepseek-ai/DeepSeek-V4-Pro", "moonshotai/Kimi-K3"]);
    const empty = recorder((m) => reply(m.startsWith("deepseek") ? "" : "{}"));
    expect((await new NebiusLlm({ NEBIUS_API_KEY: "k" }, empty.f).complete(req)).text).toBe("{}");
    const denied = recorder(() => new Response("no", { status: 401 }));
    await expect(new NebiusLlm({ NEBIUS_API_KEY: "k" }, denied.f).complete(req)).rejects.toThrow("nebius 401");
    expect(denied.models).toHaveLength(1);
  });
});

describe("explainer markdown", () => {
  it("renders bold, lists and headings, escaping HTML first", () => {
    const html = mdToHtml("## What this means\n\n**You are a provider.** It is *serious*.\n\n- Fix logging\n- Name a DPO\n\n<script>alert(1)</script>");
    expect(html).toContain("<h4>What this means</h4>");
    expect(html).toContain("<strong>You are a provider.</strong>");
    expect(html).toContain("<em>serious</em>");
    expect(html).toContain("<ul><li>Fix logging</li><li>Name a DPO</li></ul>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("**");
  });
});
