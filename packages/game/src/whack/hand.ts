/** Cosmetic official's hand holding the rubber stamp. Never affects scoring or input timing. */
const SVG = `<svg viewBox="0 0 120 150" overflow="visible" aria-hidden="true">
  <path d="M74 44 L119 12 L119 56 L88 78 Z" fill="#003399" stroke="#001a4d" stroke-width="2"/>
  <path d="M66 50 L80 38 L94 70 L82 82 Z" fill="#1d4fb8" stroke="#001a4d" stroke-width="2"/>
  <circle cx="84" cy="58" r="4.5" fill="#ffcc00" stroke="#8a6d00" stroke-width="1.2"/>
  <circle cx="40" cy="46" r="11" fill="#9a6431" stroke="#4a2c10" stroke-width="2"/>
  <rect x="34" y="52" width="12" height="44" rx="3" fill="#b07a40" stroke="#4a2c10" stroke-width="2"/>
  <rect x="14" y="94" width="52" height="18" rx="3" fill="#3a3a3a" stroke="#111" stroke-width="2"/>
  <rect x="16" y="112" width="48" height="6" fill="#c8102e"/>
  <path d="M30 60 C30 50 44 46 56 50 L72 58 C78 62 76 74 68 76 L44 80 C34 81 29 72 30 60 Z" fill="#f1c39b" stroke="#7a4b2a" stroke-width="2"/>
  <path d="M33 64 H46 M33 71 H47 M35 77 H47" stroke="#7a4b2a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
</svg>`;
/** Anchor = centre of the rubber face, in SVG viewBox fractions. */
const AX = 40 / 120;
const AY = 118 / 150;
const FLY_MS = 120;
const SLAM_MS = 220;
const LAND = 0.35;

export class Hand {
  private readonly el: HTMLDivElement;
  private readonly press: HTMLElement;
  private x = 0;
  private y = 0;
  private w = 0;
  private h = 0;
  private on = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly rest: () => { x: number; y: number },
  ) {
    this.el = document.createElement("div");
    this.el.className = "hand";
    this.el.hidden = true;
    this.el.innerHTML = `<div class="hand-wobble"><div class="hand-press">${SVG}</div></div>`;
    this.press = this.el.querySelector(".hand-press")!;
    host.append(this.el);
    window.addEventListener(
      "pointermove",
      (e) => {
        if (this.on && e.pointerType !== "touch") this.place(e.clientX, e.clientY);
      },
      { passive: true },
    );
  }

  private tf(x: number, y: number): string {
    return `translate3d(${x - this.w * AX}px, ${y - this.h * AY}px, 0)`;
  }

  private place(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.el.style.transform = this.tf(x, y);
  }

  show(on: boolean): void {
    this.on = on;
    this.el.hidden = !on;
    this.host.classList.toggle("hand-on", on);
    if (!on) return;
    this.w = this.el.offsetWidth;
    this.h = this.el.offsetHeight;
    const r = this.rest();
    this.place(r.x, r.y);
  }

  /** Animates a stamp at (x, y); returns ms until the rubber face lands (for syncing cosmetics). */
  slam(x: number, y: number, pointerType: string): number {
    if (!this.on) return 0;
    const fly = pointerType === "touch" || Math.hypot(x - this.x, y - this.y) > 48 ? FLY_MS : 0;
    if (fly) {
      const mx = (this.x + x) / 2;
      const my = Math.min(this.y, y) - Math.max(50, this.h * 0.5);
      this.el.animate([{ transform: this.tf(this.x, this.y) }, { transform: this.tf(mx, my), offset: 0.5 }, { transform: this.tf(x, y) }], {
        duration: fly,
        easing: "ease-in",
      });
    }
    this.place(x, y);
    const up = "translateY(-16%) scale(1)";
    const down = "translateY(0) scale(1.12, 0.84)";
    this.press.animate([{ transform: up }, { transform: down, offset: LAND }, { transform: down, offset: 0.55 }, { transform: up }], {
      duration: SLAM_MS,
      delay: fly,
      easing: "ease-out",
    });
    return fly + SLAM_MS * LAND;
  }
}
