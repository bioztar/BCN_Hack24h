/**
 * Copies the two skills' `skill/` trees into packages/analyzer/skills/{eu-ai-act,warden}/ and
 * records the source commits in skills/VENDORED.md. The copy is committed so deploys never
 * need GitHub credentials (warden is private).
 *
 *   npm run vendor:skills -w packages/analyzer                       # shallow-clones main of both
 *   npm run vendor:skills -w packages/analyzer -- --eu ../EU-AI-Act --warden ../warden   # local checkouts
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCES = [
  { key: "eu-ai-act", flag: "--eu", repo: "https://github.com/bioztar/EU-AI-Act.git", skill: "eu-ai-act-compliance" },
  { key: "warden", flag: "--warden", repo: "https://github.com/bioztar/warden.git", skill: "warden-compliance" },
] as const;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "skills");
const args = process.argv.slice(2);
const arg = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();

const tmp = mkdtempSync(join(tmpdir(), "vendor-skills-"));
const rows: string[] = [];
try {
  for (const s of SOURCES) {
    let src = arg(s.flag);
    if (!src) {
      src = join(tmp, s.key);
      execFileSync("git", ["clone", "--quiet", "--depth", "1", "--branch", "main", s.repo, src], { stdio: "inherit" });
    }
    src = resolve(src);
    const skillDir = join(src, "skill");
    if (!existsSync(join(skillDir, "SKILL.md"))) throw new Error(`${skillDir}/SKILL.md not found`);
    const sha = git(src, "rev-parse", "HEAD");
    const date = git(src, "log", "-1", "--format=%cs");
    const dest = join(out, s.key);
    rmSync(dest, { recursive: true, force: true });
    cpSync(skillDir, dest, { recursive: true });
    rows.push(`| \`${s.key}/\` | \`${s.skill}\` | ${s.repo.replace(/\.git$/, "")} | \`${sha}\` | ${date} |`);
    console.log(`vendored ${s.key} @ ${sha.slice(0, 7)}`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

writeFileSync(
  join(out, "VENDORED.md"),
  `# Vendored skills

Copied verbatim from each repo's \`skill/\` directory by \`scripts/vendor-skills.ts\`. Do not
edit here — fix upstream and re-run \`npm run vendor:skills -w packages/analyzer\`.

| Path | Skill | Source | Commit | Commit date |
|---|---|---|---|---|
${rows.join("\n")}

\`bioztar/warden\` is **private**: this repository must stay private unless warden goes public.
`,
);
