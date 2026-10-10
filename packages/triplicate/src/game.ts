import { DGS, FORMS, OMNIBUS, WILDCARDS, type DgId, type FormDef } from "./forms";
import { pick, rngFrom, type Rng } from "./rng";
import {
  CLEAR_PAUSE_MS, COLS, FILED_POINTS, ROWS, SPAWN_DELAY_MS, dropInterval, levelFor, rowScore,
} from "./rules";

export interface Cell {
  form: FormDef;
  junk: boolean;
  /** Stable id for animations. */
  uid: number;
}

/** grid[row][col], row 0 = top. */
export type Grid = (Cell | null)[][];

export interface PieceCell {
  dx: number;
  dy: number;
  form: FormDef;
}

export interface Piece {
  x: number;
  y: number;
  cells: PieceCell[];
}

export type GameEvent =
  | { type: "move" }
  | { type: "rotate" }
  | { type: "land"; col: number }
  | { type: "filed"; col: number; row: number; form: FormDef }
  | { type: "junk"; col: number; row: number; form: FormDef }
  | { type: "omnibus"; col: number; removed: number }
  | { type: "clear"; rows: number[]; chain: number; points: number }
  | { type: "level"; level: number }
  | { type: "over" };

export interface Stats {
  pieces: number;
  forms: number;
  filed: number;
  returned: number;
  rows: number;
  bestChain: number;
  omnibus: number;
  level: number;
}

export interface Game {
  rng: Rng;
  grid: Grid;
  piece: Piece | null;
  queue: PieceCell[][];
  score: number;
  level: number;
  stats: Stats;
  elapsedMs: number;
  dropAcc: number;
  spawnIn: number;
  softDrop: boolean;
  over: boolean;
  sinceOmnibus: number;
  dgBag: DgId[];
  events: GameEvent[];
  /** Forms that were returned to the queue, by id → count (end screen). */
  returnedBy: Map<string, number>;
  nextUid: number;
}

export const emptyGrid = (): Grid => Array.from({ length: ROWS }, () => Array<Cell | null>(COLS).fill(null));

export function createGame(seed: string): Game {
  const g: Game = {
    rng: rngFrom(seed),
    grid: emptyGrid(),
    piece: null,
    queue: [],
    score: 0,
    level: 1,
    stats: { pieces: 0, forms: 0, filed: 0, returned: 0, rows: 0, bestChain: 0, omnibus: 0, level: 1 },
    elapsedMs: 0,
    dropAcc: 0,
    spawnIn: 0,
    softDrop: false,
    over: false,
    sinceOmnibus: 0,
    dgBag: [],
    events: [],
    returnedBy: new Map(),
    nextUid: 1,
  };
  fillQueue(g);
  spawn(g);
  return g;
}

export const columnDg = (col: number) => DGS[col]!.id;

/** Does this form belong in this column's inbox? */
export function accepts(col: number, form: FormDef): boolean {
  if (form.kind === "wild" || form.kind === "omnibus") return true;
  return form.dg === columnDg(col);
}

export const junkCount = (grid: Grid): number => grid.flat().filter((c) => c?.junk).length;

export function columnHeight(grid: Grid, col: number): number {
  let h = 0;
  for (let r = ROWS - 1; r >= 0; r--) if (grid[r]![col]) h++;
  return h;
}

// ---------- piece generation ----------

/** Shuffled bag of the three DGs so each inbox gets its fair share of mail. */
function randomForm(g: Game): FormDef {
  if (g.dgBag.length === 0) {
    g.dgBag = DGS.map((d) => d.id);
    for (let i = g.dgBag.length - 1; i > 0; i--) {
      const j = Math.floor(g.rng() * (i + 1));
      [g.dgBag[i], g.dgBag[j]] = [g.dgBag[j]!, g.dgBag[i]!];
    }
  }
  const dg = g.dgBag.pop()!;
  return pick(g.rng, FORMS.filter((f) => f.dg === dg));
}

function makeSpec(g: Game): PieceCell[] {
  const { rng } = g;
  const junk = junkCount(g.grid);
  if ((junk >= 2 && g.sinceOmnibus >= 10 && rng() < 0.3) || (junk >= 4 && g.sinceOmnibus >= 6)) {
    g.sinceOmnibus = 0;
    return [{ dx: 0, dy: 0, form: OMNIBUS }];
  }
  g.sinceOmnibus++;
  if (rng() < 0.04) return [{ dx: 0, dy: 0, form: pick(rng, WILDCARDS) }];
  const level = levelFor(g.stats.pieces + g.queue.length);
  const r = rng();
  const size = level < 3 ? (r < 0.7 ? 1 : 2) : r < 0.5 ? 1 : r < 0.85 ? 2 : 3;
  const vertical = rng() < 0.5;
  return Array.from({ length: size }, (_, i) => ({
    dx: vertical ? 0 : i,
    dy: vertical ? i : 0,
    form: randomForm(g),
  }));
}

function fillQueue(g: Game): void {
  while (g.queue.length < 3) g.queue.push(makeSpec(g));
}

export const pieceWidth = (cells: PieceCell[]): number => Math.max(...cells.map((c) => c.dx)) + 1;

function spawn(g: Game): void {
  fillQueue(g);
  const cells = g.queue.shift()!;
  fillQueue(g);
  const w = pieceWidth(cells);
  const piece: Piece = { x: w >= 3 ? 0 : 1, y: 0, cells };
  g.dropAcc = 0;
  if (collides(g.grid, piece)) {
    g.piece = null;
    endGame(g);
    return;
  }
  g.piece = piece;
}

function endGame(g: Game): void {
  if (g.over) return;
  g.over = true;
  g.stats.level = g.level;
  g.events.push({ type: "over" });
}

// ---------- movement ----------

export function collides(grid: Grid, p: Piece): boolean {
  return p.cells.some((c) => {
    const x = p.x + c.dx;
    const y = p.y + c.dy;
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    if (y < 0) return false;
    return grid[y]![x] !== null;
  });
}

const moved = (p: Piece, dx: number, dy: number): Piece => ({ ...p, x: p.x + dx, y: p.y + dy });

export function move(g: Game, dir: -1 | 1): boolean {
  if (!g.piece || g.over) return false;
  const next = moved(g.piece, dir, 0);
  if (collides(g.grid, next)) return false;
  g.piece = next;
  g.events.push({ type: "move" });
  return true;
}

/** Clockwise in screen space: (dx, dy) → (−dy, dx), then normalised to the top-left. */
export function rotateCells(cells: PieceCell[]): PieceCell[] {
  const r = cells.map((c) => ({ ...c, dx: -c.dy, dy: c.dx }));
  const minX = Math.min(...r.map((c) => c.dx));
  const minY = Math.min(...r.map((c) => c.dy));
  return r.map((c) => ({ ...c, dx: c.dx - minX, dy: c.dy - minY }));
}

const KICKS: readonly [number, number][] = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]];

export function rotate(g: Game): boolean {
  if (!g.piece || g.over) return false;
  const cells = rotateCells(g.piece.cells);
  for (const [kx, ky] of KICKS) {
    const next: Piece = { x: g.piece.x + kx, y: g.piece.y + ky, cells };
    if (!collides(g.grid, next)) {
      g.piece = next;
      g.events.push({ type: "rotate" });
      return true;
    }
  }
  return false;
}

export function canFall(g: Game): boolean {
  return !!g.piece && !collides(g.grid, moved(g.piece, 0, 1));
}

export function hardDrop(g: Game): void {
  if (!g.piece || g.over) return;
  while (canFall(g)) g.piece = moved(g.piece, 0, 1);
  lock(g);
}

// ---------- locking & resolution ----------

function compact(grid: Grid, col: number): void {
  const stack: Cell[] = [];
  for (let r = ROWS - 1; r >= 0; r--) {
    const c = grid[r]![col];
    if (c) stack.push(c);
  }
  for (let r = ROWS - 1, i = 0; r >= 0; r--, i++) grid[r]![col] = stack[i] ?? null;
}

/** Rows whose three forms are all in the right inbox. */
export function fullRows(grid: Grid): number[] {
  const rows: number[] = [];
  for (let r = 0; r < ROWS; r++) if (grid[r]!.every((c) => c !== null && !c.junk)) rows.push(r);
  return rows;
}

/** Destination row for each piece cell under column gravity (bottom cells first). */
export function landingRows(grid: Grid, p: Piece): { cell: PieceCell; col: number; row: number }[] {
  const heights = Array.from({ length: COLS }, (_, c) => columnHeight(grid, c));
  return [...p.cells]
    .sort((a, b) => b.dy - a.dy)
    .map((cell) => {
      const col = p.x + cell.dx;
      const row = ROWS - 1 - heights[col]!;
      heights[col]!++;
      return { cell, col, row };
    });
}

export function lock(g: Game): void {
  const p = g.piece;
  if (!p || g.over) return;
  g.piece = null;
  g.stats.pieces++;
  const landed = landingRows(g.grid, p);
  for (const { cell, col, row } of landed) {
    if (row < 0) {
      endGame(g);
      return;
    }
    const form = cell.form;
    g.stats.forms++;
    if (form.kind === "omnibus") {
      let removed = 0;
      for (let r = 0; r < ROWS; r++) {
        if (g.grid[r]![col]?.junk) {
          g.grid[r]![col] = null;
          removed++;
        }
      }
      compact(g.grid, col);
      g.stats.omnibus++;
      g.events.push({ type: "omnibus", col, removed });
      continue;
    }
    const ok = accepts(col, form);
    const target = ROWS - 1 - columnHeight(g.grid, col);
    g.grid[target]![col] = { form, junk: !ok, uid: g.nextUid++ };
    if (ok) {
      g.score += FILED_POINTS;
      g.stats.filed++;
      g.events.push({ type: "filed", col, row: target, form });
    } else {
      g.stats.returned++;
      g.returnedBy.set(form.id, (g.returnedBy.get(form.id) ?? 0) + 1);
      g.queue.splice(Math.min(2, g.queue.length), 0, [{ dx: 0, dy: 0, form }]);
      g.events.push({ type: "junk", col, row: target, form });
    }
  }
  g.events.push({ type: "land", col: p.x });

  let chain = 0;
  for (;;) {
    const rows = fullRows(g.grid);
    if (rows.length === 0) break;
    chain++;
    const points = rowScore(rows.length, chain);
    g.score += points;
    g.stats.rows += rows.length;
    for (const r of rows) g.grid[r] = Array<Cell | null>(COLS).fill(null);
    for (let c = 0; c < COLS; c++) compact(g.grid, c);
    g.events.push({ type: "clear", rows, chain, points });
  }
  g.stats.bestChain = Math.max(g.stats.bestChain, chain);

  const level = levelFor(g.stats.pieces);
  if (level !== g.level) {
    g.level = level;
    g.stats.level = level;
    g.events.push({ type: "level", level });
  }
  g.spawnIn = SPAWN_DELAY_MS + (chain > 0 ? CLEAR_PAUSE_MS : 0);
}

export const currentInterval = (g: Game): number => {
  const base = dropInterval(g.level);
  return g.softDrop ? Math.min(base, 40) : base;
};

/** Advance the simulation by dt ms. */
export function update(g: Game, dt: number): void {
  if (g.over) return;
  g.elapsedMs += dt;
  if (!g.piece) {
    g.spawnIn -= dt;
    if (g.spawnIn <= 0) spawn(g);
    return;
  }
  g.dropAcc += dt;
  const interval = currentInterval(g);
  while (g.piece && g.dropAcc >= interval) {
    g.dropAcc -= interval;
    if (canFall(g)) g.piece = moved(g.piece, 0, 1);
    else {
      lock(g);
      break;
    }
  }
}

export function drainEvents(g: Game): GameEvent[] {
  const e = g.events;
  g.events = [];
  return e;
}

export const nextPiece = (g: Game): PieceCell[] | undefined => g.queue[0];

/** Greedy sorter: rotation × column with the most accepted forms, then the lowest stack. */
export function bestPlacement(g: Game): { rot: number; x: number } | null {
  if (!g.piece) return null;
  let best: { rot: number; x: number; ok: number; h: number } | null = null;
  let cells = g.piece.cells;
  for (let rot = 0; rot < 4; rot++) {
    const w = Math.max(...cells.map((c) => c.dx)) + 1;
    for (let x = 0; x + w <= COLS; x++) {
      const ok = cells.filter((c) => accepts(x + c.dx, c.form)).length;
      const h = Math.max(...cells.map((c) => columnHeight(g.grid, x + c.dx)));
      if (!best || ok > best.ok || (ok === best.ok && h < best.h)) best = { rot, x, ok, h };
    }
    cells = rotateCells(cells);
  }
  return best && { rot: best.rot, x: best.x };
}

export function steer(g: Game, target: { rot: number; x: number }): void {
  for (let i = 0; i < target.rot; i++) rotate(g);
  for (let i = 0; i < COLS && g.piece && g.piece.x < target.x; i++) move(g, 1);
  for (let i = 0; i < COLS && g.piece && g.piece.x > target.x; i++) move(g, -1);
}
