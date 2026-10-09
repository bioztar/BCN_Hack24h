import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkGagsFile } from "./gags.js";
import { renderClipLines } from "./lines.js";
import { loadManifest } from "./manifest.js";
import { STAGES, type Stage } from "./plan.js";
import { DEFAULT_CAP_USD, runStages } from "./run.js";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const HELP = `assetgen <command> [options]

commands
  stills | models3d | voices | clips   (any stage alone)
  all                                  run every stage in budget order (stills → models3d → voices → clips)
  lines [--write]                      render content/clip-lines.md from the manifest (--check: fail if stale)
  check-gags [--write]                 validate content/gags.yaml; with corpora, verify every provision

options
  --dry-run          print every call + cost estimate, make none (no keys needed)
  --cap <usd>        hard cap on running total across stages incl. past spend (default ${DEFAULT_CAP_USD})
  --only <id,id>     restrict to these manifest ids
  --force            ignore content-hash skips
  --include-optional also plan entries marked optional: true (extra personas)
  --manifest <path>  default assets/manifest.yaml
  --out <dir>        default assets/generated
  --ai-act <file>    EU-AI-Act corpus file (env AI_ACT_CORPUS)
  --warden <dir>     warden checkout (env WARDEN_DIR)

env: FAL_API_KEY (stills, models3d, clips), SLNG_API_KEY (voices)`;

export interface Args {
  command: string;
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | boolean> = {};
  let command = "";
  const valued = new Set(["cap", "only", "manifest", "out", "ai-act", "warden"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split("=", 2) as [string, string | undefined];
      if (valued.has(k)) {
        const v = inline ?? argv[++i];
        if (v === undefined) throw new Error(`--${k} needs a value`);
        flags[k] = v;
      } else flags[k] = true;
    } else if (!command) command = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  return { command, flags };
}

export async function main(argv: string[]): Promise<number> {
  const { command, flags } = parseArgs(argv);
  const manifestPath = resolve(String(flags.manifest ?? join(REPO_ROOT, "assets/manifest.yaml")));
  const outDir = resolve(String(flags.out ?? join(REPO_ROOT, "assets/generated")));

  if (!command || command === "help" || flags.help) {
    console.log(HELP);
    return command ? 0 : 1;
  }
  if (command === "lines") {
    const md = renderClipLines(loadManifest(manifestPath));
    const target = join(REPO_ROOT, "content/clip-lines.md");
    if (flags.write) writeFileSync(target, md);
    else if (flags.check) {
      const cur = existsSync(target) ? readFileSync(target, "utf8") : "";
      if (cur !== md) {
        console.error("content/clip-lines.md is stale — run: assetgen lines --write");
        return 1;
      }
    } else process.stdout.write(md);
    return 0;
  }
  if (command === "check-gags") {
    const aiAct = (flags["ai-act"] as string | undefined) ?? process.env.AI_ACT_CORPUS;
    const warden = (flags.warden as string | undefined) ?? process.env.WARDEN_DIR;
    const r = checkGagsFile(join(REPO_ROOT, "content/gags.yaml"), { aiAct, warden, write: !!flags.write });
    for (const l of r.lines) console.log(l);
    return r.ok ? 0 : 1;
  }
  const stages: Stage[] =
    command === "all" ? [...STAGES] : (STAGES as readonly string[]).includes(command) ? [command as Stage] : [];
  if (!stages.length) throw new Error(`unknown command ${command}\n\n${HELP}`);
  const cap = flags.cap === undefined ? DEFAULT_CAP_USD : Number(flags.cap);
  if (!Number.isFinite(cap) || cap < 0) throw new Error(`--cap must be a non-negative number of USD`);
  await runStages(loadManifest(manifestPath), stages, {
    outDir,
    dryRun: !!flags["dry-run"],
    capUsd: cap,
    force: !!flags.force,
    includeOptional: !!flags["include-optional"],
    only: typeof flags.only === "string" ? flags.only.split(",").map((s) => s.trim()) : undefined,
  });
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: Error) => {
      console.error(`assetgen: ${err.message}`);
      process.exit(2);
    },
  );
}
