import regs from "./regs.json";

export interface Reg {
  id: string;
  short: string;
  label: string;
  title: string;
  url: string;
  fact: string;
  evidence?: string;
}
export type PickupKind = "sandbox" | "delegated";

export const PILLAR_REGS: readonly Reg[] = regs.pillars;
export const PICKUP_REGS: Readonly<Record<PickupKind, Reg>> = regs.pickups;

/** World units: fixed height, width follows the screen. Pacing never depends on the screen. */
export const WORLD_H = 640;
export const GROUND_Y = 584;
export const C = {
  gravity: 1500,
  flapV: -440,
  maxFall: 720,
  radius: 13,
  pillarW: 68,
  spacing: 240,
  firstX: 420,
  v0: 150,
  vMax: 285,
  vStep: 4.5,
  gap0: 200,
  gapMin: 128,
  gapStep: 3.2,
  edge: 70,
  sandboxMs: 3000,
  movingCount: 4,
  moveAmp: 70,
  moveHz: 0.55,
  sandboxChance: 0.12,
  delegatedChance: 0.1,
  stepMs: 1000 / 120,
} as const;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedToInt(seed: string | number): number {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Difficulty curve: speed rises with score, gaps narrow with pillar index. Both clamp. */
export const speedAt = (score: number): number => Math.min(C.vMax, C.v0 + C.vStep * score);
export const gapAt = (index: number): number => Math.max(C.gapMin, C.gap0 - C.gapStep * index);

/** Leaderboard cap: you cannot pass pillars faster than vMax / spacing per second. */
export const maxPlausibleScore = (durationMs: number): number =>
  Math.floor((Math.max(0, durationMs) / 1000) * (C.vMax / C.spacing)) + 1;

export interface Pillar {
  index: number;
  x: number;
  baseY: number;
  gap: number;
  reg: number;
  passed: boolean;
  moveFrom: number | null;
  moveAmp: number;
}
export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  taken: boolean;
}
export type Cause = "pillar" | "floor";
export interface Verdict {
  reg: Reg;
  cause: Cause;
}
export type GameEvent =
  | { type: "flap" }
  | { type: "score"; score: number }
  | { type: "pickup"; kind: PickupKind }
  | { type: "bounce" }
  | { type: "crash"; verdict: Verdict };

export interface State {
  phase: "ready" | "play" | "dead";
  rng: () => number;
  seed: number;
  t: number;
  bird: { x: number; y: number; vy: number };
  score: number;
  pillars: Pillar[];
  pickups: Pickup[];
  sandboxUntil: number;
  verdict: Verdict | null;
  stats: { flaps: number; sandboxes: number; delegatedActs: number };
  events: GameEvent[];
  acc: number;
}

export function newGame(seed: string | number): State {
  const s = seedToInt(seed);
  const st: State = {
    phase: "ready",
    rng: mulberry32(s),
    seed: s,
    t: 0,
    bird: { x: 0, y: WORLD_H * 0.42, vy: 0 },
    score: 0,
    pillars: [],
    pickups: [],
    sandboxUntil: 0,
    verdict: null,
    stats: { flaps: 0, sandboxes: 0, delegatedActs: 0 },
    events: [],
    acc: 0,
  };
  ensurePillars(st, 2000);
  return st;
}

function addPillar(st: State): void {
  const index = st.pillars.length ? st.pillars[st.pillars.length - 1].index + 1 : 0;
  const gap = gapAt(index);
  const lo = C.edge + gap / 2;
  const hi = GROUND_Y - C.edge - gap / 2;
  const prev = st.pillars[st.pillars.length - 1];
  let baseY = lo + st.rng() * (hi - lo);
  if (prev) baseY = clamp(baseY, prev.baseY - 210, prev.baseY + 210);
  let reg = Math.floor(st.rng() * PILLAR_REGS.length);
  if (prev && reg === prev.reg) reg = (reg + 1) % PILLAR_REGS.length;
  const p: Pillar = { index, x: C.firstX + index * C.spacing, baseY, gap, reg, passed: false, moveFrom: null, moveAmp: 0 };
  if (prev && prev.index >= 3) {
    const r = st.rng();
    const kind: PickupKind | null = r < C.sandboxChance ? "sandbox" : prev.index >= 6 && r < C.sandboxChance + C.delegatedChance ? "delegated" : null;
    if (kind) st.pickups.push({ kind, x: (prev.x + p.x) / 2, y: (prev.baseY + p.baseY) / 2, taken: false });
  }
  st.pillars.push(p);
}

function ensurePillars(st: State, ahead: number): void {
  while (!st.pillars.length || st.pillars[st.pillars.length - 1].x < st.bird.x + ahead) addPillar(st);
  while (st.pillars.length > 4 && st.pillars[0].x < st.bird.x - 900) st.pillars.shift();
  while (st.pickups.length && st.pickups[0].x < st.bird.x - 900) st.pickups.shift();
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Gap centre at time t (delegated acts make pillars oscillate). */
export function gapY(p: Pillar, t: number): number {
  if (p.moveFrom === null) return p.baseY;
  return p.baseY + p.moveAmp * Math.sin(((t - p.moveFrom) / 1000) * Math.PI * 2 * C.moveHz);
}

export function flap(st: State): void {
  if (st.phase === "dead") return;
  if (st.phase === "ready") st.acc = 0;
  st.phase = "play";
  st.bird.vy = C.flapV;
  st.stats.flaps++;
  st.events.push({ type: "flap" });
}

export function circleHitsRect(cx: number, cy: number, r: number, x: number, y: number, w: number, h: number): boolean {
  if (w <= 0 || h <= 0) return false;
  const nx = clamp(cx, x, x + w);
  const ny = clamp(cy, y, y + h);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

export function hitsPillar(p: Pillar, t: number, bx: number, by: number, r = C.radius): boolean {
  const cy = gapY(p, t);
  const left = p.x - C.pillarW / 2;
  const top = cy - p.gap / 2;
  const bottom = cy + p.gap / 2;
  return circleHitsRect(bx, by, r, left, -1000, C.pillarW, top + 1000) || circleHitsRect(bx, by, r, left, bottom, C.pillarW, GROUND_Y - bottom);
}

export const sandboxed = (st: State): boolean => st.t < st.sandboxUntil;

function die(st: State, reg: Reg, cause: Cause): void {
  st.phase = "dead";
  st.verdict = { reg, cause };
  st.events.push({ type: "crash", verdict: st.verdict });
}

function tick(st: State, dt: number): void {
  const s = dt / 1000;
  st.t += dt;
  const b = st.bird;
  b.vy = Math.min(C.maxFall, b.vy + C.gravity * s);
  b.y += b.vy * s;
  b.x += speedAt(st.score) * s;
  ensurePillars(st, 2000);

  if (b.y < C.radius) {
    b.y = C.radius;
    b.vy = Math.max(0, b.vy);
  }

  for (const k of st.pickups) {
    if (k.taken || Math.abs(k.x - b.x) > 30 || Math.abs(k.y - b.y) > 30) continue;
    k.taken = true;
    st.events.push({ type: "pickup", kind: k.kind });
    if (k.kind === "sandbox") {
      st.sandboxUntil = Math.max(st.sandboxUntil, st.t + C.sandboxMs);
      st.stats.sandboxes++;
    } else {
      st.stats.delegatedActs++;
      let n = 0;
      for (const p of st.pillars) {
        if (n >= C.movingCount) break;
        if (p.x - C.pillarW / 2 <= b.x + C.radius) continue;
        const room = Math.min(p.baseY - p.gap / 2 - C.edge * 0.5, GROUND_Y - C.edge * 0.5 - (p.baseY + p.gap / 2));
        p.moveAmp = clamp(room, 0, C.moveAmp);
        p.moveFrom = st.t;
        n++;
      }
    }
  }

  const shield = sandboxed(st);
  for (const p of st.pillars) {
    if (!p.passed && b.x - C.radius > p.x + C.pillarW / 2) {
      p.passed = true;
      st.score++;
      st.events.push({ type: "score", score: st.score });
    }
    if (!shield && hitsPillar(p, st.t, b.x, b.y)) return die(st, PILLAR_REGS[p.reg], "pillar");
  }

  if (b.y + C.radius >= GROUND_Y) {
    if (shield) {
      b.y = GROUND_Y - C.radius;
      b.vy = C.flapV;
      st.events.push({ type: "bounce" });
    } else {
      const next = st.pillars.find((p) => !p.passed) ?? st.pillars[st.pillars.length - 1];
      b.y = GROUND_Y - C.radius;
      return die(st, PILLAR_REGS[next.reg], "floor");
    }
  }
}

/** Advance by real elapsed ms using a fixed timestep. Ready phase only bobs. */
export function step(st: State, elapsedMs: number): void {
  if (st.phase === "ready") {
    st.acc = (st.acc + elapsedMs) % 100000;
    st.bird.y = WORLD_H * 0.42 + Math.sin(st.acc / 300) * 8;
    return;
  }
  if (st.phase !== "play") return;
  st.acc += Math.min(elapsedMs, 250);
  while (st.acc >= C.stepMs && st.phase === "play") {
    st.acc -= C.stepMs;
    tick(st, C.stepMs);
  }
}

export interface Rank {
  min: number;
  title: string;
}
export const RANKS: readonly Rank[] = [
  { min: 0, title: "Rejected at reception" },
  { min: 1, title: "Stagiaire (unpaid)" },
  { min: 3, title: "Desk Officer" },
  { min: 8, title: "Head of Unit" },
  { min: 15, title: "Director" },
  { min: 25, title: "Director-General" },
  { min: 40, title: "Commissioner" },
  { min: 60, title: "President of the Commission" },
];
export function rankFor(score: number): { rank: Rank; next: Rank | null } {
  let i = 0;
  while (i + 1 < RANKS.length && score >= RANKS[i + 1].min) i++;
  return { rank: RANKS[i], next: RANKS[i + 1] ?? null };
}

/** Same rate as the server's Meanwhile counter (≈ one Chinese model per 18 s, at least one). */
export const chinaModelsDuring = (durationMs: number): number => 1 + Math.floor(Math.max(0, durationMs) / 1000 / 18);
export function meanwhileLine(durationMs: number): string {
  const n = chinaModelsDuring(durationMs);
  return `During your round, China released ${n} more model${n === 1 ? "" : "s"}. The EU opened a consultation on ${n === 1 ? "it" : "them"}.`;
}
