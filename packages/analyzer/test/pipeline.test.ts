import { describe, expect, it } from "vitest";
import { analyze, type Deps } from "../src/pipeline.js";
import { GitHubIntake } from "../src/intake/github.js";
import { ProvisionIndex } from "../src/provisions.js";
import { loadSkills, SKILLS_DIR } from "../src/skills.js";
import { DEFAULT_CORPUS } from "../src/plugin.js";
import type { AnalyzeRequest, ProgressEvent, Report } from "../src/types.js";
import { DESIGN_DOC, FakeLlm, HIRE_REPO, SECRET, fakeGitHub, makeDocx, makePdf } from "./fakes.js";

const index = ProvisionIndex.load(DEFAULT_CORPUS, SKILLS_DIR);
const skills = loadSkills(index);

async function run(req: AnalyzeRequest, gh = fakeGitHub(HIRE_REPO)) {
  const llm = new FakeLlm();
  const events: ProgressEvent[] = [];
  const deps: Deps = { llm, index, skills, github: new GitHubIntake({ fetchImpl: gh.impl, token: () => undefined }), now: () => new Date("2026-10-10T09:00:00Z") };
  const report = await analyze(req, deps, (e) => events.push(e), "test-id");
  return { report, events, llm, gh };
}

function everyCitation(r: Report) {
  return [
    ...r.aiAct.decisions.flatMap((d) => d.citations),
    ...r.warden.frameworks.flatMap((f) => f.citations),
    ...r.warden.decisions.flatMap((d) => d.citations),
    ...r.findings.flatMap((f) => f.citations),
    ...r.checklist.flatMap((c) => c.citations),
    ...r.overlap.flatMap((o) => o.cells.flatMap((c) => c.citations)),
    ...r.deadlines.flatMap((d) => d.citations),
    ...r.penalties.flatMap((p) => p.citations),
    ...(r.explainer?.sources ?? []),
  ];
}

function assertFullReport(r: Report) {
  expect(r.summary.aiAct.tier).toBe("high-risk (Annex III)");
  expect(r.findings.length).toBeGreaterThan(5);
  expect(r.findings.some((f) => f.skill === "eu-ai-act") && r.findings.some((f) => f.skill === "warden")).toBe(true);
  const ranks = r.findings.map((f) => ["critical", "high", "medium", "low"].indexOf(f.severity));
  expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  for (const f of r.findings) expect(f.what && f.why && f.fix && f.effort).toBeTruthy();
  expect(r.overlap.length).toBeGreaterThan(0);
  expect(r.deadlines.some((d) => d.framework === "AI Act" && d.date === "2 Aug 2026")).toBe(true);
  expect(r.penalties.some((p) => p.framework === "AI Act" && /€15M/.test(p.cap))).toBe(true);
  expect(r.summary.headlinePenalty).not.toBeNull();
  expect(r.explainer?.body).toContain("regulator");
  expect(r.disclaimer).toMatch(/not legal advice/i);
  expect(r.handoff).toMatch(/^EU AI Act — LIKELY RELEVANT\. Trigger facts:/);
  for (const c of everyCitation(r)) expect(index.has(c.id)).toBe(true);
}

describe("full pipeline (mocked Nebius + GitHub)", () => {
  it("idea", async () => {
    const { report, events } = await run({ kind: "idea", text: "An AI assistant that scores CVs and ranks applicants for EU employers, with a candidate chatbot." });
    assertFullReport(report);
    expect(report.checklists).toEqual({ "eu-ai-act": "product-idea", warden: "product-idea" });
    expect(events.filter((e) => e.type === "stage" && e.status === "done").map((e) => (e as { stage: string }).stage)).toEqual(["intake", "classify", "checklist", "report", "validate"]);
    expect(events.at(-1)?.type).toBe("report");
  });

  it("PDF design doc", async () => {
    const { report, llm } = await run({ kind: "document", file: { name: "hirerank.pdf", data: makePdf(DESIGN_DOC) } });
    assertFullReport(report);
    expect(report.checklists["eu-ai-act"]).toBe("design-doc");
    expect(llm.calls[0]!.messages[1]!.content).toContain("No human review step before rejection emails");
  });

  it("DOCX design doc", async () => {
    const { report, llm } = await run({ kind: "document", file: { name: "hirerank.docx", data: makeDocx(DESIGN_DOC) } });
    assertFullReport(report);
    expect(llm.calls[0]!.messages[1]!.content).toContain("No DPA signed yet");
  });

  it("repo — and never fetches tracked .env / key contents", async () => {
    const { report, gh, llm } = await run({ kind: "repo", repoUrl: "https://github.com/acme/hire-ai" });
    assertFullReport(report);
    expect(report.checklists).toEqual({ "eu-ai-act": "codebase", warden: "codebase" });
    expect(report.intake.sensitiveFiles).toEqual(expect.arrayContaining([".env", ".env.production", "keys/server.pem"]));
    expect(report.intake.sensitiveFiles).not.toContain(".env.example");
    const fetched = gh.requested.map((u) => decodeURIComponent(u));
    expect(fetched.some((u) => /contents\/\.env($|\?|\.production)/.test(u) || u.includes("server.pem"))).toBe(false);
    expect(fetched.some((u) => u.includes("contents/src/llm/score.ts"))).toBe(true);
    const everything = JSON.stringify(report) + llm.calls.map((c) => JSON.stringify(c.messages)).join("");
    expect(everything).not.toContain(SECRET);
    expect(report.intake.facts.join(" ")).toContain("contents NOT fetched");
  });

  it("vendor-assessment is selectable for warden", async () => {
    const { report } = await run({ kind: "idea", text: "We are buying an LLM vendor to summarise customer support tickets.", checklist: "vendor-assessment" });
    expect(report.checklists).toEqual({ "eu-ai-act": "product-idea", warden: "vendor-assessment" });
    expect(report.checklist.some((c) => c.skill === "warden" && c.itemId === "V16")).toBe(true);
  });
});

describe("citation validation", () => {
  it("drops fake provision ids and rewords unknown articles — never shown", async () => {
    const { report } = await run({ kind: "idea", text: "An AI assistant that scores CVs and ranks applicants for EU employers." });
    const json = JSON.stringify(report.findings) + JSON.stringify(report.aiAct) + JSON.stringify(report.explainer);
    for (const fake of ["gdpr-999", "fake-art-1", "ai-act-fake-1", "Art. 999", "Art. 404", "Art. 777"]) expect(json).not.toContain(fake);
    expect(report.validation.droppedIds).toEqual(expect.arrayContaining(["gdpr-999", "fake-art-1", "ai-act-fake-1"]));
    const first = report.findings.find((f) => f.what.includes("breach-notification runbook"))!;
    expect(first.what).toBe("No breach-notification runbook; see GDPR Art. 33(1).");
    const annex = report.aiAct.decisions.find((d) => d.step.startsWith("Annex III"))!;
    expect(annex.reasoning).toContain("See also the relevant provision.");
    expect(report.validation.reworded).toBeGreaterThan(0);
    expect(first.citations.map((c) => c.id)).toContain("gdpr-32");
  });

  it("warden output carries no AI Act tier citation (eu-ai-act-handoff rule)", async () => {
    const { report } = await run({ kind: "idea", text: "An AI assistant that scores CVs and ranks applicants for EU employers." });
    const wardenCites = [...report.warden.frameworks.flatMap((f) => f.citations), ...report.warden.decisions.flatMap((d) => d.citations), ...report.findings.filter((f) => f.skill === "warden").flatMap((f) => f.citations)];
    expect(wardenCites.some((c) => c.framework === "AI Act")).toBe(false);
    expect(JSON.stringify(report.warden)).not.toContain("AI Act Art. 6");
  });

  it("falls back to an index built from the vendored skills when the corpus is absent", () => {
    const fb = ProvisionIndex.load("/nonexistent/provisions.json", SKILLS_DIR);
    expect(fb.source).toBe("fallback");
    expect(fb.has("gdpr-33") && fb.has("ai-act-6") && fb.has("iso27001-a8.24") && fb.has("owasp-llm01")).toBe(true);
    expect(fb.has("gdpr-999")).toBe(false);
  });
});
