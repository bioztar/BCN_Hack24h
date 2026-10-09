import { describe, expect, it } from "vitest";
import { PocketWorld } from "../src/physics";
import { gravityFromOrientation } from "../src/motion";

function run(w: PocketWorld, seconds: number) {
  const bumps = [];
  for (let t = 0; t < seconds; t += 1 / 60) bumps.push(...w.step(1 / 60).bumps);
  return bumps;
}

describe("PocketWorld.step", () => {
  it("an upright phone lets the official settle on the floor", () => {
    const w = new PocketWorld(2, 4, 1.1);
    w.addFigure("f", "human", { x: 0, y: 1, z: -0.55 });
    w.setGravity(gravityFromOrientation(90, 0));
    run(w, 3);
    const y = w.figures.get("f")!.body.position.y;
    expect(y).toBeLessThan(-1.2);
    expect(y).toBeGreaterThan(-2);
  });

  it("tilting right slides him into the right wall and reports a bump", () => {
    const w = new PocketWorld(2, 4, 1.1);
    w.addFigure("f", "human", { x: -0.5, y: -1.4, z: -0.55 });
    w.setGravity(gravityFromOrientation(90, 0));
    run(w, 1);
    w.setGravity(gravityFromOrientation(30, 70));
    const bumps = run(w, 2);
    expect(w.figures.get("f")!.body.position.x).toBeGreaterThan(0.5);
    expect(bumps.length).toBeGreaterThan(0);
  });

  it("a hard sideways fall reports a right-wall bump with its speed", () => {
    const w = new PocketWorld(2, 4, 1.1);
    w.addFigure("f", "human", { x: -0.6, y: 0, z: -0.55 });
    w.setGravity(gravityFromOrientation(0, 90));
    const bumps = run(w, 1.5);
    const hit = bumps.find((b) => b.wall === "right" && b.figure === "f");
    expect(hit).toBeDefined();
    expect(hit!.speed).toBeGreaterThan(3);
  });

  it("resting contact does not count as a bump", () => {
    const w = new PocketWorld(2, 4, 1.1);
    w.addFigure("f", "terminal", { x: 0, y: -1.6, z: -0.55 });
    w.setGravity({ x: 0, y: -1, z: 0 });
    run(w, 2);
    expect(run(w, 2)).toEqual([]);
  });

  it("phone flat on the table: everything falls onto the back wall", () => {
    const w = new PocketWorld(2, 4, 1.1);
    w.addFigure("f", "cookie", { x: 0, y: 0, z: -0.3 });
    w.addPapers(8);
    w.setGravity(gravityFromOrientation(0, 0));
    run(w, 3);
    expect(w.figures.get("f")!.body.position.z).toBeLessThan(-0.75);
    for (const p of w.papers) expect(p.position.z).toBeLessThan(-0.9);
  });

  it("nothing escapes the box under violent shaking and huge gravity", () => {
    const w = new PocketWorld(2, 4, 1.1);
    for (const k of ["human", "terminal", "cookie"] as const) w.addFigure(k, k);
    w.addPapers(12);
    let s = 7;
    const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    for (let i = 0; i < 20; i++) {
      w.setGravity({ x: rnd() - 0.5, y: rnd() - 0.5, z: rnd() - 0.5 }, 6);
      w.shake(3, rnd);
      run(w, 0.25);
    }
    for (const b of [...[...w.figures.values()].map((f) => f.body), ...w.papers]) {
      expect(Math.abs(b.position.x)).toBeLessThanOrEqual(1.06);
      expect(Math.abs(b.position.y)).toBeLessThanOrEqual(2.06);
      expect(b.position.z).toBeLessThanOrEqual(0.06);
      expect(b.position.z).toBeGreaterThanOrEqual(-1.16);
    }
  });

  it("standUp rights a figure that is lying on the floor", () => {
    const w = new PocketWorld(2, 4, 1.1);
    const f = w.addFigure("f", "human", { x: 0, y: -1.7, z: -0.55 });
    f.body.quaternion.setFromEuler(0, 0, Math.PI / 2);
    w.setGravity({ x: 0, y: -1, z: 0 });
    run(w, 1);
    expect(w.uprightness("f")).toBeLessThan(0.5);
    w.standUp("f", 1.5);
    run(w, 2.5);
    expect(w.uprightness("f")).toBeGreaterThan(0.85);
  });

  it("resize keeps bodies inside the new box", () => {
    const w = new PocketWorld(2, 4, 1.1);
    w.addFigure("f", "human", { x: 0.9, y: 1.8, z: -0.5 });
    w.resize(1.2, 2.4);
    const p = w.figures.get("f")!.body.position;
    expect(Math.abs(p.x)).toBeLessThan(0.6);
    expect(Math.abs(p.y)).toBeLessThan(1.2);
  });
});
