/**
 * Spawn scheduler: pop-up lifetime shrinks ~1.1 s → ~0.45 s over the round, spawn gap shrinks,
 * and up to 3 holes are live at once later on. Also gives the server's plausibility cap.
 */
import { pick, type Rng } from "./rng.js";
import { COMBO_CAP, HIT_POINTS, HOLES, ROUND_MS } from "./rules.js";

export const LIFETIME_START = 1100;
export const LIFETIME_END = 450;
export const GAP_START = 720;
export const GAP_END = 260;
export const FIRST_SPAWN_MS = 250;
/** Gap jitter: each gap is base × [JITTER_MIN, JITTER_MAX). */
export const JITTER_MIN = 0.8;
export const JITTER_MAX = 1.2;

export interface Phase {
  lifetime: number;
  gap: number;
  maxLive: number;
}

export function phaseAt(elapsedMs: number): Phase {
  const p = Math.min(1, Math.max(0, elapsedMs / ROUND_MS));
  const e = p * (2 - p) * 0.35 + p * 0.65; // a touch faster early on
  return {
    lifetime: Math.round(LIFETIME_START + (LIFETIME_END - LIFETIME_START) * e),
    gap: Math.round(GAP_START + (GAP_END - GAP_START) * e),
    maxLive: elapsedMs < 12_000 ? 1 : elapsedMs < 27_000 ? 2 : 3,
  };
}

export interface Spawn {
  hole: number;
  lifetime: number;
}

export class Spawner {
  private nextAt = FIRST_SPAWN_MS;
  constructor(private readonly rng: Rng) {}

  /** Call every frame; `busy` = holes currently showing a model. */
  next(elapsedMs: number, busy: ReadonlySet<number>): Spawn | null {
    if (elapsedMs < this.nextAt || elapsedMs >= ROUND_MS) return null;
    const ph = phaseAt(elapsedMs);
    if (busy.size >= ph.maxLive) return null;
    const free: number[] = [];
    for (let h = 0; h < HOLES; h++) if (!busy.has(h)) free.push(h);
    if (!free.length) return null;
    this.nextAt = elapsedMs + ph.gap * (JITTER_MIN + (JITTER_MAX - JITTER_MIN) * this.rng());
    return { hole: pick(this.rng, free), lifetime: ph.lifetime };
  }
}

/** Upper bound on spawns in `durationMs`: every gap at its shortest jitter, holes never blocking. */
export function maxSpawns(durationMs: number): number {
  const end = Math.min(durationMs, ROUND_MS);
  let n = 0;
  for (let t = FIRST_SPAWN_MS; t < end; t += phaseAt(t).gap * JITTER_MIN) n++;
  return n;
}

/** Best possible score for `durationMs`: every spawn a non-EU hit, unbroken combo. */
export function maxPlausibleScore(durationMs: number): number {
  const n = maxSpawns(durationMs);
  let s = 0;
  for (let i = 1; i <= n; i++) s += HIT_POINTS * Math.min(i, COMBO_CAP);
  return s;
}
