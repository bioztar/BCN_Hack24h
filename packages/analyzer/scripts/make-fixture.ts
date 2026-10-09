/** Regenerates web/src/fixture-report.json (the `?mock=1` report) by running the real pipeline with mocked Nebius. */
import { writeFileSync } from "node:fs";
import { analyze } from "../src/pipeline.js";
import { GitHubIntake } from "../src/intake/github.js";
import { ProvisionIndex } from "../src/provisions.js";
import { loadSkills, SKILLS_DIR } from "../src/skills.js";
import { DEFAULT_CORPUS } from "../src/plugin.js";
import { DESIGN_DOC, FakeLlm, makeDocx } from "../test/fakes.js";

const titles = (u: string) => [...u.matchAll(/^ITEM ([A-Z]\d+) — (.+)$/gm)].map((m) => ({ id: m[1]!, title: m[2]! }));
const llm = new FakeLlm({
  "report.eu-ai-act": (r) => ({
    findings: titles(r.messages.at(-1)!.content).map(({ id, title }, k) => ({
      id,
      title,
      what: `The HireRank design document does not evidence "${title.toLowerCase()}" — it describes an LLM that scores CVs with no human review before rejection emails.`,
      why: "CV screening is listed in AI Act Annex III point 4, so provider obligations apply from 2 Aug 2026 under AI Act Art. 113.",
      fix: k % 2 ? "Add a section to the design doc with the decision, an owner and the evidence you will keep." : "Insert a human review step before any rejection and log reviewer decisions (AI Act Art. 14).",
      effort: ["S", "M", "L"][k % 3],
    })),
  }),
  "report.warden": (r) => ({
    findings: titles(r.messages.at(-1)!.content).map(({ id, title }, k) => ({
      id,
      title,
      what: `Not covered in the document: ${title.toLowerCase()}.`,
      why: k === 0 ? "CVs are personal data; GDPR Art. 5(1)(e) requires defined retention." : "Enterprise buyers and supervisory authorities will ask for this evidence.",
      fix: k === 0 ? "Set a retention period (e.g. 6 months after the hiring decision) and automate deletion." : "Document the control, assign an owner, and keep evidence that it runs.",
      effort: ["S", "M", "L"][k % 3],
    })),
  }),
});
const index = ProvisionIndex.load(DEFAULT_CORPUS, SKILLS_DIR);
const report = await analyze(
  { kind: "document", file: { name: "HireRank design v0.3.docx", data: makeDocx(DESIGN_DOC) } },
  { llm, index, skills: loadSkills(index), github: new GitHubIntake(), now: () => new Date("2026-10-10T09:00:00Z") },
  () => {},
  "fixture",
);
writeFileSync(new URL("../web/src/fixture-report.json", import.meta.url), `${JSON.stringify(report, null, 1)}\n`);
console.log(`fixture: ${report.findings.length} findings, ${report.checklist.length} checklist items, index=${report.validation.index}`);
