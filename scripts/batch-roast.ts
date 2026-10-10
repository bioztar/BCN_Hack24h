/**
 * Pre-roast the room: register every project of a CSV/JSON as an event-tagged applicant and run a silent EXPRESS
 * case for it against the running server, then print the damage.
 *
 *   docker compose exec dg-roast node node_modules/tsx/dist/cli.mjs scripts/batch-roast.ts /data/projects.csv
 *
 * Columns: project, oneLiner, repoUrl (optional). Flags: --event=bcn-hack-24h --delay=1500 --base=http://127.0.0.1:8796
 * The server needs EXPRESS_MODE=1. Cases are silent (no TTS); rows land on the normal leaderboard too.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export interface ProjectRow {
  project: string;
  oneLiner: string;
  repoUrl?: string;
}

export interface BatchResult {
  project: string;
  caseId: string | null;
  totalEur: number;
  jailMonths: number;
  meltdown: boolean;
  topLaws: string[];
  error?: string;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") row.push(cell), (cell = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += ch;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim()));
}

const FIELD: Record<string, keyof ProjectRow> = { project: "project", name: "project", startupname: "project", oneliner: "oneLiner", one_liner: "oneLiner", pitch: "oneLiner", description: "oneLiner", repourl: "repoUrl", repo: "repoUrl", github: "repoUrl" };

export function parseRows(text: string, file = "projects.csv"): ProjectRow[] {
  const raw: Record<string, unknown>[] = file.endsWith(".json") || text.trimStart().startsWith("[")
    ? (JSON.parse(text) as Record<string, unknown>[])
    : (() => {
        const [head = [], ...body] = parseCsv(text);
        return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
      })();
  const out: ProjectRow[] = [];
  for (const r of raw) {
    const o: Partial<Record<keyof ProjectRow, string>> = {};
    for (const [k, v] of Object.entries(r)) {
      const f = FIELD[k.trim().toLowerCase().replace(/[\s-]/g, "")];
      if (f && typeof v === "string" && v.trim()) o[f] = v.trim();
    }
    if (o.project) out.push({ project: o.project, oneLiner: o.oneLiner ?? "", ...(o.repoUrl ? { repoUrl: o.repoUrl } : {}) });
  }
  return out;
}

async function post(f: typeof fetch, url: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await f(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Registers the project, runs one silent express case to its verdict, reads back the leaderboard row. */
export async function roastOne(row: ProjectRow, o: { base: string; event: string; fetch?: typeof fetch }): Promise<BatchResult> {
  const f = o.fetch ?? fetch;
  const fail = (error: string): BatchResult => ({ project: row.project, caseId: null, totalEur: 0, jailMonths: 0, meltdown: false, topLaws: [], error });
  const reg = await post(f, `${o.base}/api/applicants`, { startupName: row.project.slice(0, 60), ...(row.oneLiner ? { oneLiner: row.oneLiner.slice(0, 140) } : {}), event: o.event });
  if (reg.status !== 201) return fail(`applicant ${reg.status}: ${String(reg.json.error ?? "")}`);
  const text = (row.oneLiner ? `${row.project}: ${row.oneLiner}` : row.project).slice(0, 4000);
  const body = (submission: unknown) => ({ submission, mode: "express", silent: true, event: o.event, applicantId: reg.json.applicantId, applicantToken: reg.json.applicantToken });
  let c = row.repoUrl ? await post(f, `${o.base}/api/case`, body({ kind: "repo", repoUrl: row.repoUrl, text })) : null;
  if (!c || c.status >= 400) c = await post(f, `${o.base}/api/case`, body({ kind: "text", text }));
  if (c.status >= 400) return fail(`case ${c.status}: ${String(c.json.error ?? "")}`);
  const caseId = String(c.json.caseId);
  const sse = await (await f(`${o.base}/api/case/${caseId}/stream`)).text();
  const verdict = sse
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => JSON.parse(l.slice(5)) as { type?: string; notice?: { totalEur: number; totalJailMonths: number; meltdown: boolean } })
    .find((e) => e.type === "verdict");
  if (!verdict?.notice) return { ...fail("no verdict"), caseId };
  const lb = (await (await f(`${o.base}/api/leaderboard/${caseId}`)).json().catch(() => null)) as { entry?: { topLaws?: string[] } } | null;
  return { project: row.project, caseId, totalEur: verdict.notice.totalEur, jailMonths: verdict.notice.totalJailMonths, meltdown: verdict.notice.meltdown, topLaws: lb?.entry?.topLaws ?? [] };
}

export async function runBatch(rows: ProjectRow[], o: { base: string; event: string; delayMs?: number; fetch?: typeof fetch; log?: (r: BatchResult, i: number) => void }): Promise<BatchResult[]> {
  const out: BatchResult[] = [];
  for (const [i, row] of rows.entries()) {
    if (i && o.delayMs) await new Promise((r) => setTimeout(r, o.delayMs));
    const r = await roastOne(row, o).catch((err: unknown) => ({ project: row.project, caseId: null, totalEur: 0, jailMonths: 0, meltdown: false, topLaws: [], error: err instanceof Error ? err.message : String(err) }));
    out.push(r);
    o.log?.(r, i);
  }
  return out;
}

const eur = (n: number) => (n >= 1e9 ? `€${(n / 1e9).toFixed(2)}bn` : n >= 1e6 ? `€${(n / 1e6).toFixed(1)}M` : `€${Math.round(n).toLocaleString("en-GB")}`);

export function table(results: BatchResult[]): string {
  const rows = [["project", "totalEur", "jail", "meltdown", "top laws"], ...results.map((r) => [r.project, r.error ? `ERROR ${r.error}` : eur(r.totalEur), r.error ? "" : `${r.jailMonths} mo`, r.meltdown ? "MELTDOWN" : "", r.topLaws.join(", ")])];
  const w = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
  return rows.map((r) => r.map((c, i) => c.padEnd(w[i]!)).join("  ").trimEnd()).join("\n");
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith("batch-roast.")) {
  const args = process.argv.slice(2);
  const flag = (k: string, d: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("usage: batch-roast.ts <projects.csv|json> [--event=bcn-hack-24h] [--delay=1500] [--base=http://127.0.0.1:8796]");
    process.exit(2);
  }
  const rows = parseRows(readFileSync(file, "utf8"), file);
  const base = flag("base", `http://127.0.0.1:${process.env.PORT || 8796}`);
  console.log(`pre-roasting ${rows.length} projects against ${base}`);
  const results = await runBatch(rows, { base, event: flag("event", "bcn-hack-24h"), delayMs: Number(flag("delay", "1500")), log: (r, i) => console.log(`[${i + 1}/${rows.length}] ${r.project}: ${r.error ?? eur(r.totalEur)}`) });
  console.log(`\n${table(results)}`);
  if (results.every((r) => r.error)) process.exit(1);
}
