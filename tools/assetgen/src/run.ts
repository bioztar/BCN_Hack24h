import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import type { Manifest } from "./manifest.js";
import { describeInput, planStage, round, type Call, type FileRef, type Stage } from "./plan.js";
import { FalHttp } from "./providers/fal.js";
import { SlngHttp } from "./providers/slng.js";
import type { Providers } from "./providers/types.js";
import { loadState, saveState } from "./state.js";

export const DEFAULT_CAP_USD = 20;

export class CapExceededError extends Error {}
export class MissingKeyError extends Error {}
export class MissingInputError extends Error {}

export const KEY_VARS = { fal: "FAL_API_KEY", slng: "SLNG_API_KEY" } as const;

export interface RunOptions {
  outDir: string;
  dryRun: boolean;
  capUsd?: number;
  force?: boolean;
  only?: string[];
  includeOptional?: boolean;
  env?: Record<string, string | undefined>;
  /** inject providers (tests); otherwise built from env keys */
  providers?: Partial<Providers>;
  log?: (line: string) => void;
}

export interface StageReport {
  stage: Stage;
  calls: Call[];
  pending: number;
  skipped: number;
  estimateUsd: number;
  runningTotalUsd: number;
  refused: boolean;
  optionalUsd: number;
}

export interface RunReport {
  stages: StageReport[];
  previouslySpentUsd: number;
  runningTotalUsd: number;
  capUsd: number;
}

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
};

function toDataUri(outDir: string, rel: string): string {
  const mime = MIME[extname(rel)] ?? "application/octet-stream";
  return `data:${mime};base64,${readFileSync(join(outDir, rel)).toString("base64")}`;
}

function resolveFiles(outDir: string, v: unknown): unknown {
  if (Array.isArray(v)) return v.map((x) => resolveFiles(outDir, x));
  if (v && typeof v === "object") {
    if ("$file" in v) return toDataUri(outDir, (v as FileRef).$file);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveFiles(outDir, x)]));
  }
  return v;
}

const usd = (n: number) => `$${n.toFixed(4)}`;

function requireKeys(calls: Call[], env: Record<string, string | undefined>): void {
  const missing = [...new Set(calls.map((c) => KEY_VARS[c.provider]))].filter((k) => !env[k]);
  if (missing.length) throw new MissingKeyError(`missing environment variable ${missing.join(", ")} (keys come only from env)`);
}

function buildProviders(calls: Call[], opts: RunOptions, env: Record<string, string | undefined>): Providers {
  const need = new Set(calls.map((c) => c.provider));
  return {
    fal: opts.providers?.fal ?? (need.has("fal") ? new FalHttp({ apiKey: env.FAL_API_KEY! }) : unusable("fal")),
    slng: opts.providers?.slng ?? (need.has("slng") ? new SlngHttp({ apiKey: env.SLNG_API_KEY! }) : unusable("slng")),
  };
}

function unusable(name: string): any {
  return new Proxy({}, { get: () => () => Promise.reject(new Error(`${name} provider not configured`)) });
}

export async function runStages(manifest: Manifest, stages: Stage[], opts: RunOptions): Promise<RunReport> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const env = opts.env ?? process.env;
  const cap = opts.capUsd ?? DEFAULT_CAP_USD;
  const state = loadState(opts.outDir);
  const previouslySpentUsd = round(state.spent_usd);
  let running = previouslySpentUsd;
  const reports: StageReport[] = [];

  log(`assetgen ${opts.dryRun ? "DRY RUN — no provider calls" : "LIVE"} · cap ${usd(cap)} (all stages, incl. ${usd(previouslySpentUsd)} already spent)`);

  for (const stage of stages) {
    const planOpts = { outDir: opts.outDir, state, force: opts.force, only: opts.only };
    const calls = planStage(manifest, stage, { ...planOpts, includeOptional: opts.includeOptional });
    const optionalLeft = opts.includeOptional
      ? []
      : planStage(manifest, stage, { ...planOpts, includeOptional: true }).filter((c) => !c.skip && !calls.some((x) => x.rel === c.rel));
    const pending = calls.filter((c) => !c.skip);
    const estimate = round(pending.reduce((s, c) => s + c.cost, 0));
    log("");
    log(`== stage ${stage}: ${pending.length} call(s), ${calls.length - pending.length} skipped (hash match), estimate ${usd(estimate)}`);
    for (const c of calls) {
      const qty = c.unit === "image" || c.unit === "generation" ? "1" : `${round(c.qty)} ${c.unit}`;
      log(
        `  ${c.skip ? "SKIP" : "CALL"} ${c.asset}${c.produces === "line-audio" ? " (line audio)" : ""} → ${c.rel} · ${c.provider} ${c.model} · ${qty} × ${usd(c.unitCost)} = ${usd(c.cost)}`,
      );
      if (opts.dryRun && !c.skip) {
        log(`       POST ${c.endpoint} ${c.tts ? JSON.stringify({ voice: c.tts.voiceId, speed: c.tts.speed, text: c.tts.text }) : describeInput(c.input)}`);
      }
    }
    if (optionalLeft.length)
      log(`  (+ ${optionalLeft.length} optional call(s) not planned, ${usd(round(optionalLeft.reduce((s, c) => s + c.cost, 0)))} — add --include-optional if budget remains)`);
    const projected = round(running + estimate);
    const refused = projected > cap;
    const report: StageReport = {
      stage,
      calls,
      pending: pending.length,
      skipped: calls.length - pending.length,
      estimateUsd: estimate,
      runningTotalUsd: projected,
      refused,
      optionalUsd: round(optionalLeft.reduce((s, c) => s + c.cost, 0)),
    };
    reports.push(report);
    if (refused) {
      const msg = `stage ${stage} refused: estimate ${usd(estimate)} brings running total to ${usd(projected)} > cap ${usd(cap)}`;
      if (!opts.dryRun) throw new CapExceededError(msg);
      log(`  !! ${msg} (a live run would stop here)`);
    }
    running = projected;
    log(`  running total: ${usd(running)} / cap ${usd(cap)}`);
    if (opts.dryRun || pending.length === 0) continue;

    requireKeys(pending, env);
    const providers = buildProviders(pending, opts, env);
    for (const c of pending) {
      for (const d of c.deps) {
        if (!existsSync(join(opts.outDir, d)))
          throw new MissingInputError(`${c.asset}: needs ${d} — run the stage that produces it first`);
      }
      const bytes = c.tts
        ? await providers.slng.tts(c.model, c.tts.voiceId, c.tts.text, { speed: c.tts.speed, format: "mp3" })
        : await providers.fal.generate(c.model, resolveFiles(opts.outDir, c.input) as Record<string, unknown>);
      const out = join(opts.outDir, c.rel);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, bytes);
      state.outputs[c.rel] = { hash: c.hash, at: new Date().toISOString(), cost_usd: c.cost };
      state.spent_usd = round(state.spent_usd + c.cost);
      saveState(opts.outDir, state);
      log(`  wrote ${c.rel} (${bytes.byteLength} bytes)`);
    }
  }

  const total = reports.reduce((s, r) => s + r.estimateUsd, 0);
  log("");
  log("== summary");
  for (const r of reports) log(`  ${r.stage.padEnd(9)} ${String(r.pending).padStart(3)} call(s)  ${usd(r.estimateUsd)}  running ${usd(r.runningTotalUsd)}${r.refused ? "  REFUSED" : ""}`);
  const opt = round(reports.reduce((s, r) => s + r.optionalUsd, 0));
  if (opt) log(`  optional (not planned): ${usd(opt)} — would bring the total to ${usd(round(running + opt))}`);
  log(`  this run ${usd(round(total))} + already spent ${usd(previouslySpentUsd)} = ${usd(running)} / cap ${usd(cap)}`);
  return { stages: reports, previouslySpentUsd, runningTotalUsd: running, capUsd: cap };
}
