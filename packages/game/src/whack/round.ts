/** One 45 s round on a 3×3 DOM board. Transforms + WAAPI only, so it stays at 60 fps on a phone. */
import { ModelPicker, type Model } from "../core/models";
import { pick, rngFor, type Rng } from "../core/rng";
import { ESCAPE_GRACE_MS, HOLES, ROUND_MS, STAMP_WORDS, newTally, score, type GameEvent, type Tally } from "../core/rules";
import { Spawner } from "../core/scheduler";
import type { Sfx } from "../shared/audio";
import { vibrate } from "../shared/audio";
import { el, esc, fmt } from "../shared/env";
import { starRingSvg } from "../shared/stars";

const HIT_HOLD_MS = 300;
const RETRACT_MS = 130;

interface Pop {
  model: Model;
  born: number;
  lifetime: number;
  state: "up" | "hit" | "down";
  downAt: number;
}

interface Hole {
  root: HTMLElement;
  tile: HTMLElement;
  stamp: HTMLElement;
  splat: SVGPathElement;
  float: HTMLElement;
  pop: Pop | null;
}

export interface RoundResult {
  tally: Tally;
  durationMs: number;
  seed: string;
}

export interface Hud {
  score(n: number, delta: number): void;
  combo(n: number): void;
  time(leftMs: number, frac: number): void;
}

function splatPath(rng: Rng): string {
  const n = 14;
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 26 + rng() * 16 + (i % 3 === 0 ? rng() * 14 : 0);
    d += `${i ? "L" : "M"}${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`;
  }
  for (let k = 0; k < 4; k++) {
    const a = rng() * Math.PI * 2;
    const r = 44 + rng() * 6;
    const s = 2.5 + rng() * 4;
    const x = 50 + r * Math.cos(a);
    const y = 50 + r * Math.sin(a);
    d += `Z M${(x - s).toFixed(1)} ${y.toFixed(1)}a${s} ${s} 0 1 0 ${(2 * s).toFixed(1)} 0a${s} ${s} 0 1 0 ${(-2 * s).toFixed(1)} 0`;
  }
  return d + "Z";
}

function clearStamp(h: Hole): void {
  for (const a of h.stamp.getAnimations()) a.cancel();
  h.stamp.className = "stamp";
}

export function buildBoard(board: HTMLElement): Hole[] {
  board.replaceChildren();
  const holes: Hole[] = [];
  const ring = starRingSvg(44, 3.6);
  for (let h = 0; h < HOLES; h++) {
    const root = el("div", "hole");
    root.dataset.hole = String(h);
    root.innerHTML = `<div class="stars">${ring}</div><div class="pit"><div class="tile"></div><svg class="splat" viewBox="0 0 100 100" aria-hidden="true"><path/></svg></div><div class="stamp"></div><div class="float"></div>`;
    holes.push({
      root,
      tile: root.querySelector(".tile")!,
      stamp: root.querySelector(".stamp")!,
      splat: root.querySelector(".splat path")!,
      float: root.querySelector(".float")!,
      pop: null,
    });
    board.append(root);
  }
  return holes;
}

export class Round {
  private readonly rng: Rng;
  private readonly spawner: Spawner;
  private readonly picker: ModelPicker;
  private tally = newTally();
  private t0 = 0;
  private raf = 0;
  private lastHudSec = -1;
  private done = false;
  private readonly onDown = (e: PointerEvent) => this.pointer(e);

  constructor(
    private readonly stage: HTMLElement,
    private readonly holes: Hole[],
    private readonly banner: HTMLElement,
    private readonly hud: Hud,
    private readonly sfx: Sfx,
    pool: readonly Model[],
    private readonly seed: string,
    private readonly onEnd: (r: RoundResult) => void,
  ) {
    this.rng = rngFor(seed);
    this.spawner = new Spawner(this.rng);
    this.picker = new ModelPicker(rngFor(`models:${seed}`), pool);
  }

  start(): void {
    for (const h of this.holes) {
      h.pop = null;
      h.root.classList.remove("up", "hit", "eu");
      clearStamp(h);
      h.root.addEventListener("pointerdown", this.onDown);
    }
    this.t0 = performance.now();
    this.hud.score(0, 0);
    this.hud.combo(0);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  stop(): void {
    this.done = true;
    cancelAnimationFrame(this.raf);
    for (const h of this.holes) h.root.removeEventListener("pointerdown", this.onDown);
  }

  private apply(ev: GameEvent): number {
    const r = score(this.tally, ev);
    this.tally = r.tally;
    this.hud.score(this.tally.score, r.points);
    this.hud.combo(this.tally.streak);
    return r.points;
  }

  private frame(now: number): void {
    if (this.done) return;
    const elapsed = now - this.t0;
    const busy = new Set<number>();
    this.holes.forEach((h, i) => {
      const p = h.pop;
      if (!p) return;
      if (p.state === "up" && elapsed - p.born >= p.lifetime) {
        this.retract(h, elapsed);
        if (p.model.eu) {
          this.apply("spared");
          this.floatText(h, "Approved ✓", "ok");
        } else {
          const grace = elapsed < ESCAPE_GRACE_MS;
          const pts = this.apply(grace ? "escape_grace" : "escape");
          this.floatText(h, grace ? "Escaped — transition period, no fine" : `${pts} escaped into the single market`, "bad small");
          this.sfx.escape();
        }
      } else if (p.state === "hit" && elapsed - p.born >= HIT_HOLD_MS) {
        this.retract(h, elapsed);
      } else if (p.state === "down" && elapsed >= p.downAt + RETRACT_MS) {
        h.pop = null;
        h.root.classList.remove("hit", "eu");
        clearStamp(h);
        return;
      }
      busy.add(i);
    });
    if (elapsed >= ROUND_MS) return this.finish();
    const sp = this.spawner.next(elapsed, busy);
    if (sp) this.show(this.holes[sp.hole]!, this.picker.next(elapsed), elapsed, sp.lifetime);
    const left = ROUND_MS - elapsed;
    const sec = Math.ceil(left / 100);
    if (sec !== this.lastHudSec) {
      this.lastHudSec = sec;
      this.hud.time(left, left / ROUND_MS);
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private show(h: Hole, m: Model, elapsed: number, lifetime: number): void {
    h.pop = { model: m, born: elapsed, lifetime, state: "up", downAt: 0 };
    const long = m.name.length > 6 ? " long" : "";
    h.tile.className = `tile${long}`;
    h.tile.style.setProperty("--bg", m.bg);
    h.tile.style.setProperty("--fg", m.fg);
    h.tile.innerHTML = `<span class="flag">${m.flag}</span><b>${esc(m.name)}</b><small>${esc(m.maker)}</small>`;
    h.root.classList.toggle("eu", !!m.eu);
    h.root.classList.remove("hit");
    clearStamp(h);
    h.root.classList.add("up");
  }

  private retract(h: Hole, elapsed: number): void {
    if (!h.pop) return;
    h.pop.state = "down";
    h.pop.downAt = elapsed;
    h.root.classList.remove("up");
  }

  private pointer(e: PointerEvent): void {
    if (this.done) return;
    e.preventDefault();
    const idx = Number((e.currentTarget as HTMLElement).dataset.hole);
    const h = this.holes[idx];
    if (!h) return;
    const p = h.pop;
    const elapsed = performance.now() - this.t0;
    if (!p || p.state === "down") {
      this.apply("miss");
      this.sfx.tap();
      h.root.animate([{ transform: "scale(0.96)" }, { transform: "scale(1)" }], { duration: 120 });
      return;
    }
    if (p.state === "hit") return;
    p.state = "hit";
    p.born = elapsed;
    h.root.classList.add("hit");
    this.stampOn(h, p.model);
    if (p.model.eu) {
      this.apply("mistral");
      this.sfx.buzzer();
      vibrate([80, 40, 140]);
      this.floatText(h, "−500", "bad big");
      this.banned();
    } else {
      const pts = this.apply("hit");
      this.sfx.stamp(0.9 + this.rng() * 0.25);
      vibrate(15);
      const combo = this.tally.streak > 1 ? ` ×${Math.min(this.tally.streak, 10)}` : "";
      this.floatText(h, `+${fmt(pts)}${combo}`, "good");
    }
  }

  private stampOn(h: Hole, m: Model): void {
    const word = m.eu ? "REFUSÉ" : pick(this.rng, STAMP_WORDS);
    h.stamp.textContent = word;
    h.stamp.className = `stamp on${word.length > 11 ? " long" : ""}`;
    h.splat.setAttribute("d", splatPath(this.rng));
    const rot = -18 + this.rng() * 26;
    h.stamp.animate(
      [
        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(2.3)`, opacity: 0 },
        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(0.92)`, opacity: 1, offset: 0.7 },
        { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, opacity: 0.92 },
      ],
      { duration: 140, easing: "ease-in", fill: "forwards" },
    );
  }

  private floatText(h: Hole, text: string, cls: string): void {
    h.float.textContent = text;
    h.float.className = `float ${cls}`;
    h.float.animate(
      [
        { transform: "translate(-50%, 0) scale(0.8)", opacity: 0 },
        { transform: "translate(-50%, -30%) scale(1)", opacity: 1, offset: 0.15 },
        { transform: "translate(-50%, -110%) scale(1)", opacity: 0 },
      ],
      { duration: 800, easing: "ease-out", fill: "forwards" },
    );
  }

  private banned(): void {
    this.banner.hidden = false;
    this.banner.animate(
      [
        { transform: "translate(-50%,-50%) scale(2.4) rotate(-6deg)", opacity: 0 },
        { transform: "translate(-50%,-50%) scale(1) rotate(-6deg)", opacity: 1, offset: 0.12 },
        { transform: "translate(-50%,-50%) scale(1) rotate(-6deg)", opacity: 1, offset: 0.85 },
        { transform: "translate(-50%,-50%) scale(1.05) rotate(-6deg)", opacity: 0 },
      ],
      { duration: 1500, easing: "ease-out", fill: "forwards" },
    ).onfinish = () => (this.banner.hidden = true);
    this.stage.animate(
      [0, -14, 12, -10, 8, -5, 3, 0].map((x, i) => ({ transform: `translate(${x}px, ${i % 2 ? 6 : -6}px)` })),
      { duration: 420, easing: "linear" },
    );
    this.stage.animate([{ boxShadow: "inset 0 0 0 100vmax rgba(200,16,46,0.45)" }, { boxShadow: "inset 0 0 0 100vmax rgba(200,16,46,0)" }], { duration: 600 });
  }

  private finish(): void {
    this.stop();
    for (const h of this.holes) h.root.classList.remove("up");
    this.hud.time(0, 0);
    this.onEnd({ tally: this.tally, durationMs: ROUND_MS, seed: this.seed });
  }
}
