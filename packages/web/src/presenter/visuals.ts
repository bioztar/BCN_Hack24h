import { isBroken, markBroken, portraitCandidates } from "../assets";
import type { BetterPlaceCause, Persona } from "../contract";
import { h } from "../dom";

/**
 * Self-sufficient stage effects (no v2 Picsart art required): canvas flames + embers, an SVG
 * heat-shimmer filter, flying-paper particles and CSS cause tiles. Optional art under
 * `assets/generated/{cutout,still,tiles}/` with the contract name is preferred when it loads.
 */

/** `<img>` that walks `urls` until one loads (misses are cached app-wide); all fail → `fallback`. */
export function firstImage(urls: string[], cls: string, alt: string, fallback?: () => HTMLElement): HTMLElement {
  const queue = urls.filter((u) => !isBroken(u));
  const img = h("img", { class: cls, alt, draggable: "false" });
  const wrap = h("span", { class: "fi" }, img);
  let cur = "";
  const next = () => {
    const u = queue.shift();
    if (!u) {
      img.remove();
      if (fallback) wrap.replaceChildren(fallback());
      return;
    }
    cur = u;
    img.src = u;
  };
  img.addEventListener("error", () => (markBroken(cur), next()));
  next();
  return wrap;
}

/** Burning portrait: optional `-burning` art → `-appalled` cut-out → appalled still → anything. */
export function burningCandidates(p: Persona): string[] {
  return [...new Set([`/assets/generated/cutout/${p.id}-burning.png`, `/assets/generated/still/${p.id}-burning.png`, ...portraitCandidates(p, "appalled")])];
}

let shimmerReady = false;
/** One shared SVG filter (`url(#heat)`), animated turbulence = heat haze. */
export function ensureHeatFilter(): void {
  if (shimmerReady || typeof document === "undefined") return;
  shimmerReady = true;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.innerHTML = `<filter id="heat" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012 0.06" numOctaves="2" seed="3" result="n">
      <animate attributeName="baseFrequency" dur="3s" values="0.012 0.06;0.016 0.09;0.012 0.06" repeatCount="indefinite"/>
    </feTurbulence>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`;
  document.body.append(svg);
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  ember: boolean;
}

/** Canvas flames rising from the bottom edge, with embers drifting above. */
export class Fire {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private parts: Particle[] = [];
  private raf = 0;
  private last = 0;
  intensity = 1;

  constructor(cls = "fire") {
    this.el = h("canvas", { class: cls, "aria-hidden": "true" });
    this.ctx = this.el.getContext("2d");
  }

  start(): void {
    if (this.raf || !this.ctx) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.parts = [];
  }

  private spawn(w: number, hgt: number, ember: boolean): Particle {
    const max = ember ? 1.6 + Math.random() * 1.6 : 0.6 + Math.random() * 0.7;
    return {
      x: Math.random() * w,
      y: hgt + (ember ? 0 : Math.random() * 10),
      vx: (Math.random() - 0.5) * (ember ? 40 : 18),
      vy: -(ember ? 60 + Math.random() * 90 : 90 + Math.random() * 140) * (hgt / 400),
      life: 0,
      max,
      size: ember ? 1.5 + Math.random() * 2.5 : (18 + Math.random() * 30) * (w / 400),
      ember,
    };
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const ctx = this.ctx!;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const { clientWidth: w, clientHeight: hgt } = this.el;
    if (!w || !hgt) return;
    if (this.el.width !== w || this.el.height !== hgt) {
      this.el.width = w;
      this.el.height = hgt;
    }
    const want = Math.round((w / 4) * this.intensity);
    for (let i = 0; i < want * dt * 3 && this.parts.length < want; i++) this.parts.push(this.spawn(w, hgt, Math.random() < 0.12));
    ctx.clearRect(0, 0, w, hgt);
    ctx.globalCompositeOperation = "lighter";
    this.parts = this.parts.filter((p) => {
      p.life += dt;
      if (p.life >= p.max) return false;
      p.x += (p.vx + Math.sin((now / 1000) * 3 + p.y / 30) * (p.ember ? 30 : 12)) * dt;
      p.y += p.vy * dt;
      const t = p.life / p.max;
      if (p.ember) {
        ctx.fillStyle = `rgba(255,${180 - t * 120},60,${1 - t})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        return true;
      }
      const r = p.size * (1 - t * 0.6);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      const hot = Math.max(0, 1 - t * 1.6);
      g.addColorStop(0, `rgba(255,${200 + 55 * hot},${80 * hot},${0.55 * (1 - t)})`);
      g.addColorStop(0.45, `rgba(255,${90 + 60 * hot},0,${0.35 * (1 - t)})`);
      g.addColorStop(1, "rgba(120,10,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      return true;
    });
    ctx.globalCompositeOperation = "source-over";
  };
}

/** Flying-paper particles (pure CSS animation; random paths via custom properties). */
export function paperStorm(n = 22): HTMLElement {
  const forms = ["FORM 27-B", "ANNEX IV", "Art. 5", "CERTIFIED COPY", "IN TRIPLICATE", "§ 42", "DPIA", "CE", "REFUSÉ", "APOSTILLE"];
  return h(
    "div",
    { class: "papers", "aria-hidden": "true" },
    Array.from({ length: n }, (_, i) => {
      const x0 = Math.round(Math.random() * 100);
      const x1 = Math.round(x0 + (Math.random() - 0.5) * 80);
      const style = `--x0:${x0}%;--x1:${x1}%;--r0:${Math.round(Math.random() * 90 - 45)}deg;--r1:${Math.round(Math.random() * 720 - 360)}deg;--d:${(2.4 + Math.random() * 2.8).toFixed(2)}s;--dl:${(-Math.random() * 5).toFixed(2)}s;--s:${(0.7 + Math.random() * 0.8).toFixed(2)}`;
      return h("i", { class: "paper", style }, forms[i % forms.length]!);
    }),
  );
}

export const CAUSES: Record<BetterPlaceCause, { emoji: string; label: string; bg: string; fg: string }> = {
  climate: { emoji: "🌍", label: "Climate", bg: "#0a8f3c", fg: "#fff" },
  lgbtq: { emoji: "🏳️‍🌈", label: "LGBTQ+", bg: "#7b2cbf", fg: "#fff" },
  refugees: { emoji: "🛟", label: "Refugees", bg: "#ff6b00", fg: "#000" },
  homeless: { emoji: "🏠", label: "Homeless", bg: "#8d6e63", fg: "#fff" },
  ukraine: { emoji: "🌻", label: "Ukraine", bg: "#0057b7", fg: "#ffd700" },
  "rare-diseases": { emoji: "🧬", label: "Rare diseases", bg: "#d81b60", fg: "#fff" },
  "gender-equality": { emoji: "⚖️", label: "Gender equality", bg: "#ffd617", fg: "#000" },
  "animal-welfare": { emoji: "🐾", label: "Animal welfare", bg: "#00897b", fg: "#fff" },
  accessibility: { emoji: "♿", label: "Accessibility", bg: "#1565c0", fg: "#fff" },
  "ai-safety": { emoji: "🤖", label: "AI safety", bg: "#212121", fg: "#ffd617" },
};

/** Poster tile: optional `tiles/<cause>.png`, else bold emoji on a colour block. */
export function causeTile(cause: BetterPlaceCause): HTMLElement {
  const c = CAUSES[cause];
  const poster = () => h("span", { class: "tile-poster", style: `--bg:${c.bg};--fg:${c.fg}` }, h("b", null, c.emoji), h("span", null, c.label));
  return h("figure", { class: "cause-tile", style: `--bg:${c.bg};--fg:${c.fg}` }, firstImage([`/assets/generated/tiles/${cause}.png`], "tile-img", c.label, poster));
}
