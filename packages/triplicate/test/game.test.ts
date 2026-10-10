import { describe, expect, it } from "vitest";
import { FORMS, OMNIBUS, WILDCARDS, type FormDef } from "../src/forms";
import {
  bestPlacement,
  steer,
  accepts, collides, createGame, drainEvents, emptyGrid, fullRows, hardDrop, lock, move, rotate, rotateCells,
  update, type Game, type Piece,
} from "../src/game";
import { COLS, ROWS, SPAWN_DELAY_MS, maxPlausibleScore } from "../src/rules";
import { rngFrom } from "../src/rng";

const formFor = (dg: string): FormDef => FORMS.find((f) => f.dg === dg)!;
const CN = formFor("cnect");
const JU = formFor("just");
const FI = formFor("fisma");

function setPiece(g: Game, forms: FormDef[], x: number, vertical = false): void {
  g.piece = { x, y: 0, cells: forms.map((form, i) => ({ dx: vertical ? 0 : i, dy: vertical ? i : 0, form })) };
}

function fresh(): Game {
  const g = createGame("test");
  g.grid = emptyGrid();
  g.queue = [];
  drainEvents(g);
  return g;
}

describe("verdict logic", () => {
  it("each column accepts only its DG's forms; wildcards and omnibus fit anywhere", () => {
    expect(accepts(0, CN)).toBe(true);
    expect(accepts(1, CN)).toBe(false);
    expect(accepts(1, JU)).toBe(true);
    expect(accepts(2, FI)).toBe(true);
    expect(accepts(0, FI)).toBe(false);
    for (let c = 0; c < COLS; c++) {
      expect(accepts(c, WILDCARDS[0]!)).toBe(true);
      expect(accepts(c, OMNIBUS)).toBe(true);
    }
  });

  it("a matched form is filed and scores 10", () => {
    const g = fresh();
    setPiece(g, [JU], 1);
    hardDrop(g);
    expect(g.grid[ROWS - 1]![1]).toMatchObject({ form: JU, junk: false });
    expect(g.score).toBe(10);
    expect(drainEvents(g).map((e) => e.type)).toContain("filed");
  });

  it("a wrong inbox turns grey and sends the form back to the queue", () => {
    const g = fresh();
    setPiece(g, [FI], 0);
    hardDrop(g);
    expect(g.grid[ROWS - 1]![0]).toMatchObject({ form: FI, junk: true });
    expect(g.score).toBe(0);
    expect(g.stats.returned).toBe(1);
    expect(g.queue.some((spec) => spec.length === 1 && spec[0]!.form === FI)).toBe(true);
  });

  it("three matched forms in a row are APPROVED IN TRIPLICATE and cleared", () => {
    const g = fresh();
    setPiece(g, [CN, JU, FI], 0);
    hardDrop(g);
    expect(g.grid.flat().every((c) => c === null)).toBe(true);
    expect(g.score).toBe(30 + 300);
    expect(g.stats.rows).toBe(1);
    const clear = drainEvents(g).find((e) => e.type === "clear");
    expect(clear).toMatchObject({ rows: [ROWS - 1], chain: 1, points: 300 });
  });

  it("a row with a returned (junk) form never clears", () => {
    const g = fresh();
    setPiece(g, [FI, JU, FI], 0);
    hardDrop(g);
    expect(fullRows(g.grid)).toEqual([]);
    expect(g.grid[ROWS - 1]!.filter(Boolean)).toHaveLength(3);
  });

  it("the simplification package repeals the junk in its column", () => {
    const g = fresh();
    setPiece(g, [JU], 0);
    hardDrop(g);
    setPiece(g, [CN], 0);
    hardDrop(g);
    expect(g.grid[ROWS - 2]![0]).toMatchObject({ form: CN });
    setPiece(g, [OMNIBUS], 0);
    hardDrop(g);
    expect(g.grid[ROWS - 1]![0]).toMatchObject({ form: CN, junk: false });
    expect(g.grid[ROWS - 2]![0]).toBeNull();
    expect(drainEvents(g).find((e) => e.type === "omnibus")).toMatchObject({ col: 0, removed: 1 });
  });

  it("forms fall to the top of their own column (column gravity)", () => {
    const g = fresh();
    setPiece(g, [CN], 0);
    hardDrop(g);
    setPiece(g, [CN, JU], 0);
    hardDrop(g);
    expect(g.grid[ROWS - 2]![0]).toMatchObject({ form: CN });
    expect(g.grid[ROWS - 1]![1]).toMatchObject({ form: JU });
  });

  it("clearing a row lets the stack fall and chains multiply", () => {
    const g = fresh();
    // column 1 and 2 have one filed form each, column 0 a vertical pair arrives
    setPiece(g, [JU, FI], 1);
    hardDrop(g);
    setPiece(g, [JU, FI], 1);
    hardDrop(g);
    expect(g.score).toBe(40);
    setPiece(g, [CN, CN], 0, true);
    hardDrop(g);
    // both rows complete at once: 2 rows × 300 × chain 1
    expect(g.stats.rows).toBe(2);
    expect(g.score).toBe(40 + 20 + 600);
  });

  it("stack overflow archives the file (game over)", () => {
    const g = fresh();
    for (let r = 0; r <= ROWS; r++) {
      setPiece(g, [CN], 1);
      g.piece!.y = -1;
      lock(g);
      if (g.over) break;
    }
    expect(g.over).toBe(true);
    expect(drainEvents(g).some((e) => e.type === "over")).toBe(true);
  });
});

describe("movement & collision", () => {
  it("walls and stacked forms block movement", () => {
    const g = fresh();
    setPiece(g, [CN], 0);
    expect(move(g, -1)).toBe(false);
    expect(move(g, 1)).toBe(true);
    g.grid[0]![2] = { form: FI, junk: false, uid: 1 };
    expect(move(g, 1)).toBe(false);
  });

  it("collides outside the board and over cells; not above the top", () => {
    const grid = emptyGrid();
    const p = (x: number, y: number): Piece => ({ x, y, cells: [{ dx: 0, dy: 0, form: CN }] });
    expect(collides(grid, p(-1, 0))).toBe(true);
    expect(collides(grid, p(3, 0))).toBe(true);
    expect(collides(grid, p(0, ROWS))).toBe(true);
    expect(collides(grid, p(0, -1))).toBe(false);
    grid[5]![1] = { form: CN, junk: false, uid: 1 };
    expect(collides(grid, p(1, 5))).toBe(true);
  });

  it("rotation cycles a stapled pair through four orientations", () => {
    let cells = [{ dx: 0, dy: 0, form: CN }, { dx: 1, dy: 0, form: JU }];
    cells = rotateCells(cells);
    expect(cells.map((c) => [c.dx, c.dy])).toEqual([[0, 0], [0, 1]]);
    cells = rotateCells(cells);
    expect(cells.map((c) => [c.form.dg, c.dx, c.dy])).toEqual([["cnect", 1, 0], ["just", 0, 0]]);
    cells = rotateCells(rotateCells(cells));
    expect(cells.map((c) => [c.form.dg, c.dx, c.dy])).toEqual([["cnect", 0, 0], ["just", 1, 0]]);
  });

  it("rotation kicks off the right wall", () => {
    const g = fresh();
    setPiece(g, [CN, JU, FI], 2, true);
    expect(rotate(g)).toBe(true);
    expect(g.piece!.x).toBe(0);
  });
});

describe("simulation", () => {
  it("gravity moves the piece and locks it, then spawns the next after the delay", () => {
    const g = createGame("gravity");
    const first = g.piece!;
    for (let i = 0; i < 400 && g.stats.pieces === 0; i++) update(g, 50);
    expect(g.stats.pieces).toBe(1);
    expect(g.piece).toBeNull();
    update(g, SPAWN_DELAY_MS + 400);
    expect(g.piece).not.toBeNull();
    expect(g.piece).not.toBe(first);
  });

  it("same seed → same pieces", () => {
    const a = createGame("seed-1");
    const b = createGame("seed-1");
    expect(a.queue.map((s) => s.map((c) => c.form.id))).toEqual(b.queue.map((s) => s.map((c) => c.form.id)));
  });

  it("random play never beats the leaderboard cap, and always ends", () => {
    for (let s = 0; s < 40; s++) {
      const g = createGame(`fuzz-${s}`);
      const rng = rngFrom(`bot-${s}`);
      for (let t = 0; t < 200000 && !g.over; t++) {
        const r = rng();
        if (g.piece) {
          if (r < 0.25) move(g, -1);
          else if (r < 0.5) move(g, 1);
          else if (r < 0.6) rotate(g);
          else if (r < 0.75) hardDrop(g);
        }
        update(g, 16);
      }
      expect(g.over).toBe(true);
      expect(g.score).toBeLessThanOrEqual(maxPlausibleScore(g.elapsedMs));
    }
  });

  it("a perfect sorter scores well and stays under the cap", () => {
    const g = createGame("perfect");
    for (let t = 0; t < 20000 && !g.over && g.stats.pieces < 300; t++) {
      if (g.piece) sortPiece(g);
      update(g, 16);
    }
    expect(g.stats.rows).toBeGreaterThan(10);
    expect(g.score).toBeLessThanOrEqual(maxPlausibleScore(g.elapsedMs));
  });
});

describe("mail distribution", () => {
  it("each DG gets a fair share of forms (shuffled bag)", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const g = createGame(seed);
      const counts = new Map<string, number>();
      for (let t = 0; t < 20000 && !g.over && g.stats.forms < 60; t++) {
        if (g.piece) {
          for (const c of g.piece.cells) if (c.form.dg) counts.set(c.form.dg, (counts.get(c.form.dg) ?? 0) + 1);
          sortPiece(g);
        }
        update(g, 16);
      }
      const v = [...counts.values()];
      expect(v).toHaveLength(3);
      expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(8);
    }
  });
});

/** Greedy bot via the exported sorter. */
function sortPiece(g: Game): void {
  steer(g, bestPlacement(g)!);
  hardDrop(g);
}
