import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface State {
  version: 1;
  /** output path (relative to the generated dir) → content hash it was produced from */
  outputs: Record<string, { hash: string; at: string; cost_usd: number }>;
  /** estimated spend actually incurred by live runs so far (all providers) */
  spent_usd: number;
}

export const STATE_FILE = ".assetgen-state.json";

export function loadState(outDir: string): State {
  const p = join(outDir, STATE_FILE);
  if (!existsSync(p)) return { version: 1, outputs: {}, spent_usd: 0 };
  const s = JSON.parse(readFileSync(p, "utf8")) as Partial<State>;
  return { version: 1, outputs: s.outputs ?? {}, spent_usd: s.spent_usd ?? 0 };
}

export function saveState(outDir: string, state: State): void {
  const p = join(outDir, STATE_FILE);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(state, null, 2) + "\n");
}
