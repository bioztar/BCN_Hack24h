// Markdown pass/skip/fail table from test-results/results.json (the PR / triage summary).
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "test-results/results.json";
const report = JSON.parse(readFileSync(file, "utf8"));
const rows = [];
const walk = (suite, trail) => {
  for (const s of suite.suites ?? []) walk(s, s.title && !s.title.endsWith(".ts") ? [...trail, s.title] : trail);
  for (const spec of suite.specs ?? [])
    for (const t of spec.tests) {
      const r = t.results.at(-1) ?? {};
      const status = t.status === "skipped" ? "skip" : t.status === "expected" ? "pass" : t.status === "flaky" ? "flaky" : "FAIL";
      const reason = t.annotations.filter((a) => a.type === "skip").map((a) => a.description).join("; ");
      const err = (r.errors?.[0]?.message ?? r.error?.message ?? "").replace(/\u001b\[[0-9;]*m/g, "").split("\n")[0];
      rows.push({ file: spec.file, title: [...trail, spec.title].join(" › "), project: t.projectName, status, ms: r.duration ?? 0, note: status === "skip" ? reason : status === "FAIL" ? err : "" });
    }
};
walk(report, []);
const count = (s) => rows.filter((r) => r.status === s).length;
const esc = (s) => String(s).replace(/\|/g, "\\|").slice(0, 160);
console.log(`**${count("pass")} passed · ${count("skip")} skipped · ${count("FAIL")} failed${count("flaky") ? ` · ${count("flaky")} flaky` : ""}** (${(report.stats?.duration / 60000).toFixed(1)} min)\n`);
console.log("| spec | test | project | result | time | note |\n|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.file} | ${esc(r.title)} | ${r.project} | ${r.status} | ${(r.ms / 1000).toFixed(1)}s | ${esc(r.note)} |`);
