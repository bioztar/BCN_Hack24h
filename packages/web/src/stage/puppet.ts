import { initials, markBroken, type Expression } from "../assets";
import type { Persona } from "../contract";
import { h } from "../dom";

/**
 * Portrait puppet: no moving mouth. Expression is shown by hard CUTS between cut-outs/stills
 * (neutral/stamping/smug/appalled) on line/stamp/tier events, plus blinks, a brow raise on
 * stamps and a gentle head bob. No image → procedural silhouette. Rig coordinates assume a
 * centred chest-up 3:4 portrait (the asset prompt).
 */
const RIG = { eyeY: 31, eyeDx: 8.5 };

export class Puppet {
  readonly el: HTMLElement;
  private readonly rig: HTMLElement;
  private readonly photo: HTMLElement;
  private readonly base: HTMLImageElement;
  private readonly silhouette: HTMLElement;
  private url: string | null = null;
  private loading = "";
  private talking = false;
  private expr = "";
  private nextBlink = performance.now() + 1500 + Math.random() * 3000;
  private raf = 0;
  private readonly phase = Math.random() * 10;

  constructor(persona: Persona) {
    this.base = h("img", { class: "pp-base", alt: persona.name, draggable: "false" });
    const eyes = ["l", "r"].flatMap((s) => [h("i", { class: `pp-lid ${s}` }), h("i", { class: `pp-brow ${s}` })]);
    this.photo = h("div", { class: "pp-photo", hidden: true }, this.base, eyes);
    this.silhouette = h(
      "div",
      { class: "ph" },
      h("div", { class: "ph-head" }, h("i", { class: "ph-brow l" }), h("i", { class: "ph-brow r" }), h("i", { class: "ph-eye l" }), h("i", { class: "ph-eye r" }), h("i", { class: "ph-mouth" })),
      h("div", { class: "ph-body" }, h("span", { class: "ph-badge" }, initials(persona.name))),
      h("small", { class: "ph-note" }, "Photograph pending — Form IMG-1"),
    );
    this.rig = h("div", { class: "pp-rig" }, this.photo, this.silhouette);
    this.el = h(
      "div",
      { class: "puppet", style: `--accent:${persona.color};--ey:${RIG.eyeY}%;--edx:${RIG.eyeDx}%` },
      this.rig,
    );
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Show the first loadable image of `images` for `expr`; silhouette if none load. */
  show(images: string[], expr: Expression): void {
    this.el.dataset.expr = expr;
    this.silhouette.dataset.expr = expr;
    if (expr !== this.expr) {
      if (this.expr) this.cut();
      this.expr = expr;
    }
    const want = images[0];
    if (!want) {
      this.url = null;
      this.photo.hidden = true;
      this.silhouette.hidden = false;
      return;
    }
    if (want === this.url || want === this.loading) return;
    this.loading = want;
    const probe = new Image();
    probe.onload = () => {
      if (this.loading !== want) return;
      this.loading = "";
      this.url = want;
      this.base.src = want;
      this.photo.hidden = false;
      this.silhouette.hidden = true;
      this.sampleSkin(probe);
    };
    probe.onerror = () => {
      markBroken(want);
      if (this.loading !== want) return;
      this.loading = "";
      this.show(images.slice(1), expr);
    };
    probe.src = want;
  }

  setTalking(talking: boolean): void {
    if (talking && !this.talking) this.cut();
    this.talking = talking;
  }

  /** A visible expression cut: brief punch-in + flash. */
  private cut(): void {
    this.el.classList.remove("cut");
    void this.el.offsetWidth;
    this.el.classList.add("cut");
  }

  /** Eyebrows up + a jolt (stamp impact). */
  startle(): void {
    this.el.classList.remove("brow");
    void this.el.offsetWidth;
    this.el.classList.add("brow");
    setTimeout(() => this.el.classList.remove("brow"), 1100);
  }

  private sampleSkin(img: HTMLImageElement): void {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const g = c.getContext("2d", { willReadFrequently: true });
      if (!g) return;
      // bridge of the nose, between the eyes
      g.drawImage(img, img.naturalWidth * 0.5, img.naturalHeight * ((RIG.eyeY + 2) / 100), 2, 2, 0, 0, 1, 1);
      const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data;
      if (a && a > 200) this.el.style.setProperty("--skin", `rgb(${r},${gr},${b})`);
    } catch {
      /* tainted canvas: keep default skin */
    }
  }

  private readonly frame = (now: number) => {
    if (now > this.nextBlink) {
      this.el.classList.add("blink");
      setTimeout(() => this.el.classList.remove("blink"), 130);
      this.nextBlink = now + 1800 + Math.random() * 4200;
    }
    const t = now / 1000 + this.phase;
    const bob = this.talking ? Math.sin(t * 2.2) * 0.8 : Math.sin(t * 1.3) * 0.5;
    const tilt = this.talking ? Math.sin(t * 1.4) * 1.4 : Math.sin(t * 0.7) * 0.8;
    this.rig.style.transform = `translateY(${bob.toFixed(2)}%) rotate(${tilt.toFixed(2)}deg)`;
    this.raf = requestAnimationFrame(this.frame);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.el.remove();
  }
}
