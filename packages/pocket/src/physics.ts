import * as CANNON from "cannon-es";
import type { Vec3 } from "./motion";

export type BodyKind = "human" | "terminal" | "cookie";
export type WallId = "floor" | "ceiling" | "left" | "right" | "back" | "glass";

export interface Bump { figure: string; wall: WallId; speed: number; }
export interface StepResult { bumps: Bump[]; }

export const G = 9.82;
/** Contacts slower than this (m/s along the normal) are just resting, not bumps. */
export const BUMP_SPEED = 1.1;
const BUMP_COOLDOWN = 0.45;
const SUBSTEP = 1 / 120;

interface Wall { id: WallId; body: CANNON.Body; normal: CANNON.Vec3; }

export interface Figure {
  id: string;
  kind: BodyKind;
  body: CANNON.Body;
  /** Seconds the figure has spent lying still; drives "gets up under protest". */
  lyingFor: number;
  rightingFor: number;
  lastBump: Partial<Record<WallId, number>>;
  preVel: CANNON.Vec3;
}

const figureMat = new CANNON.Material("figure");
const wallMat = new CANNON.Material("wall");
const paperMat = new CANNON.Material("paper");

/** A shallow box: x ∈ [-w/2, w/2], y ∈ [-h/2, h/2], z ∈ [-d, 0] (z = 0 is the phone glass). */
export class PocketWorld {
  readonly world = new CANNON.World();
  readonly figures = new Map<string, Figure>();
  readonly papers: CANNON.Body[] = [];
  private walls: Wall[] = [];
  private pending: Bump[] = [];
  private time = 0;
  private acc = 0;
  w: number;
  h: number;
  d: number;

  constructor(w = 2, h = 4, d = 1.1) {
    this.w = w;
    this.h = h;
    this.d = d;
    this.world.gravity.set(0, -G, 0);
    this.world.allowSleep = false;
    (this.world.solver as CANNON.GSSolver).iterations = 12;
    this.world.addContactMaterial(new CANNON.ContactMaterial(figureMat, wallMat, { friction: 0.35, restitution: 0.32 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(figureMat, figureMat, { friction: 0.3, restitution: 0.4 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(paperMat, wallMat, { friction: 0.6, restitution: 0.05 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(paperMat, figureMat, { friction: 0.4, restitution: 0.05 }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(paperMat, paperMat, { friction: 0.5, restitution: 0.02 }));
    const ids: WallId[] = ["floor", "ceiling", "left", "right", "back", "glass"];
    for (const id of ids) {
      const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: wallMat, shape: new CANNON.Plane() });
      this.world.addBody(body);
      this.walls.push({ id, body, normal: new CANNON.Vec3() });
    }
    this.layoutWalls();
  }

  resize(w: number, h: number, d = this.d): void {
    this.w = w;
    this.h = h;
    this.d = d;
    this.layoutWalls();
    for (const b of this.allBodies()) this.clampInside(b);
  }

  private layoutWalls(): void {
    const { w, h, d } = this;
    const place: Record<WallId, [CANNON.Vec3, CANNON.Vec3]> = {
      floor: [new CANNON.Vec3(0, -h / 2, -d / 2), new CANNON.Vec3(0, 1, 0)],
      ceiling: [new CANNON.Vec3(0, h / 2, -d / 2), new CANNON.Vec3(0, -1, 0)],
      left: [new CANNON.Vec3(-w / 2, 0, -d / 2), new CANNON.Vec3(1, 0, 0)],
      right: [new CANNON.Vec3(w / 2, 0, -d / 2), new CANNON.Vec3(-1, 0, 0)],
      back: [new CANNON.Vec3(0, 0, -d), new CANNON.Vec3(0, 0, 1)],
      glass: [new CANNON.Vec3(0, 0, 0), new CANNON.Vec3(0, 0, -1)],
    };
    for (const wall of this.walls) {
      const [pos, normal] = place[wall.id];
      wall.body.position.copy(pos);
      wall.normal.copy(normal);
      wall.body.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), normal);
    }
  }

  private allBodies(): CANNON.Body[] {
    return [...[...this.figures.values()].map((f) => f.body), ...this.papers];
  }

  private clampInside(b: CANNON.Body): void {
    const m = 0.12;
    const p = b.position;
    p.x = Math.min(this.w / 2 - m, Math.max(-this.w / 2 + m, p.x));
    p.y = Math.min(this.h / 2 - m, Math.max(-this.h / 2 + m, p.y));
    p.z = Math.min(-m, Math.max(-this.d + m, p.z));
  }

  /** Gravity from a unit device-frame vector; `strength` 1 = Earth. */
  setGravity(dir: Vec3, strength = 1): void {
    this.world.gravity.set(dir.x * G * strength, dir.y * G * strength, dir.z * G * strength);
  }

  addFigure(id: string, kind: BodyKind, at: Vec3 = { x: 0, y: 0, z: -this.d / 2 }): Figure {
    this.removeFigure(id);
    const body = new CANNON.Body({ mass: kind === "cookie" ? 2 : 3.5, material: figureMat, linearDamping: 0.05, angularDamping: 0.25 });
    if (kind === "human") {
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.21, 0.34, 0.13)), new CANNON.Vec3(0, -0.12, 0));
      body.addShape(new CANNON.Sphere(0.16), new CANNON.Vec3(0, 0.34, 0));
    } else if (kind === "terminal") {
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.3, 0.3, 0.26)), new CANNON.Vec3(0, 0.0, 0));
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.18, 0.12, 0.12)), new CANNON.Vec3(0, -0.38, 0));
    } else {
      const disc = new CANNON.Cylinder(0.3, 0.3, 0.11, 10);
      const q = new CANNON.Quaternion();
      q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
      body.addShape(disc, new CANNON.Vec3(0, 0.12, 0), q);
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.12, 0.17, 0.07)), new CANNON.Vec3(0, -0.32, 0));
    }
    body.position.set(at.x, at.y, at.z);
    this.clampInside(body);
    const fig: Figure = { id, kind, body, lyingFor: 0, rightingFor: 0, lastBump: {}, preVel: new CANNON.Vec3() };
    body.addEventListener("collide", (e: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
      const wall = this.walls.find((w) => w.body === e.body);
      if (!wall) return;
      // cannon-es emits "collide" after solving, so use the velocity from before this substep.
      const speed = Math.max(Math.abs(e.contact.getImpactVelocityAlongNormal()), -fig.preVel.dot(wall.normal));
      if (speed < BUMP_SPEED || this.time - (fig.lastBump[wall.id] ?? -Infinity) < BUMP_COOLDOWN) return;
      fig.lastBump[wall.id] = this.time;
      this.pending.push({ figure: id, wall: wall.id, speed });
    });
    this.world.addBody(body);
    this.figures.set(id, fig);
    return fig;
  }

  removeFigure(id: string): void {
    const f = this.figures.get(id);
    if (!f) return;
    this.world.removeBody(f.body);
    this.figures.delete(id);
  }

  addPapers(n: number, seed = 1): void {
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const body = new CANNON.Body({ mass: 0.04, material: paperMat, linearDamping: 0.55, angularDamping: 0.5 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.11, 0.15, 0.008)));
      body.position.set((rnd() - 0.5) * (this.w - 0.4), (rnd() - 0.5) * (this.h - 0.4), -0.15 - rnd() * (this.d - 0.3));
      body.quaternion.setFromEuler(rnd() * 6, rnd() * 6, rnd() * 6);
      this.world.addBody(body);
      this.papers.push(body);
    }
  }

  /** Random kicks to everything — a shake. */
  shake(strength = 1, rnd: () => number = Math.random): void {
    for (const b of this.allBodies()) {
      const k = strength * b.mass * 4;
      b.applyImpulse(new CANNON.Vec3((rnd() - 0.5) * k, (rnd() - 0.2) * k, (rnd() - 0.5) * k * 0.4));
      b.angularVelocity.set((rnd() - 0.5) * 12, (rnd() - 0.5) * 12, (rnd() - 0.5) * 12);
    }
  }

  /** Small knock on one figure (a tap). */
  poke(id: string, dir: Vec3, strength = 1): void {
    const f = this.figures.get(id);
    if (!f) return;
    const k = 2.2 * strength * f.body.mass;
    f.body.applyImpulse(new CANNON.Vec3(dir.x * k, dir.y * k, dir.z * k), f.body.position.vadd(new CANNON.Vec3(0, 0.25, 0)));
  }

  /** Cosine between the figure's head direction and "up" (against gravity). 1 upright, -1 on his head. */
  uprightness(id: string): number {
    const f = this.figures.get(id);
    if (!f) return 1;
    const up = f.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    const g = this.world.gravity;
    const gl = g.length() || 1;
    return -(up.x * g.x + up.y * g.y + up.z * g.z) / gl;
  }

  /** Cosine between the figure's face direction and gravity: > 0.7 means face down. */
  faceDownness(id: string): number {
    const f = this.figures.get(id);
    if (!f) return 0;
    const fwd = f.body.quaternion.vmult(new CANNON.Vec3(0, 0, 1));
    const g = this.world.gravity;
    const gl = g.length() || 1;
    return (fwd.x * g.x + fwd.y * g.y + fwd.z * g.z) / gl;
  }

  speed(id: string): number {
    const f = this.figures.get(id);
    return f ? f.body.velocity.length() + f.body.angularVelocity.length() * 0.2 : 0;
  }

  /** Make a figure get up: torque its head towards "up" for `seconds`. */
  standUp(id: string, seconds = 1.2): void {
    const f = this.figures.get(id);
    if (f) f.rightingFor = seconds;
  }

  step(dt: number): StepResult {
    const h = Math.min(dt, 1 / 20);
    for (const f of this.figures.values()) this.applyRighting(f, h);
    this.acc = Math.min(this.acc + h, SUBSTEP * 8);
    while (this.acc >= SUBSTEP) {
      for (const f of this.figures.values()) f.preVel.copy(f.body.velocity);
      this.world.step(SUBSTEP);
      this.time += SUBSTEP;
      this.acc -= SUBSTEP;
    }
    for (const b of this.allBodies()) this.rescueEscapee(b);
    const bumps = this.pending;
    this.pending = [];
    return { bumps };
  }

  private applyRighting(f: Figure, dt: number): void {
    if (f.rightingFor <= 0) return;
    f.rightingFor -= dt;
    const g = this.world.gravity;
    const gl = g.length();
    if (gl < 1e-3) return;
    const target = new CANNON.Vec3(-g.x / gl, -g.y / gl, -g.z / gl);
    const up = f.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    const axis = up.cross(target);
    const k = 70 * f.body.mass;
    f.body.torque.x += axis.x * k - f.body.angularVelocity.x * 6 * f.body.mass;
    f.body.torque.y += axis.y * k - f.body.angularVelocity.y * 6 * f.body.mass;
    f.body.torque.z += axis.z * k - f.body.angularVelocity.z * 6 * f.body.mass;
    if (up.dot(target) < 0.9) f.body.force.vadd(target.scale(gl * f.body.mass * 0.6), f.body.force);
  }

  /** Planes are half-spaces, but belt and braces: nothing may leave the box. */
  private rescueEscapee(b: CANNON.Body): void {
    const p = b.position;
    const out = Math.abs(p.x) > this.w / 2 + 0.05 || Math.abs(p.y) > this.h / 2 + 0.05 || p.z > 0.05 || p.z < -this.d - 0.05;
    if (!out) return;
    this.clampInside(b);
    b.velocity.scale(0.2, b.velocity);
  }
}
