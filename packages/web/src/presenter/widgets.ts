import type { Meanwhile } from "../contract";
import { fmtInt, h } from "../dom";
import { elapsedText } from "../live/meanwhile";

/** Number that rolls to its target (the final value always equals the server's). */
export class Roller {
  readonly el: HTMLElement;
  private shown = 0;
  private target = 0;
  private raf = 0;
  constructor(
    private readonly fmt: (n: number) => string,
    cls = "roller",
  ) {
    this.el = h("span", { class: cls }, fmt(0));
  }
  set(n: number, instant = false): void {
    this.target = n;
    if (instant || typeof requestAnimationFrame === "undefined") {
      this.shown = n;
      this.el.textContent = this.fmt(n);
      return;
    }
    if (!this.raf) this.raf = requestAnimationFrame(this.step);
  }
  private step = () => {
    const d = this.target - this.shown;
    this.shown = Math.abs(d) < 1 ? this.target : this.shown + d * 0.14;
    this.el.textContent = this.fmt(this.shown === this.target ? this.target : Math.round(this.shown));
    this.raf = this.shown === this.target ? 0 : requestAnimationFrame(this.step);
  };
}

/** The three-column MEANWHILE scoreboard. */
export class MeanwhileBoard {
  readonly el: HTMLElement;
  private readonly cn = new Roller(fmtInt, "mw-num");
  private readonly us = new Roller(fmtInt, "mw-num");
  private readonly regs = new Roller(fmtInt, "mw-num");
  private readonly forms = new Roller(fmtInt, "mw-num small");
  private readonly notes: HTMLElement[];
  private readonly title: HTMLElement;

  constructor(private readonly mode: "case" | "day") {
    this.notes = [0, 1, 2].map(() => h("small", { class: "mw-note" }));
    this.title = h("div", { class: "mw-title" }, "MEANWHILE");
    this.el = h(
      "section",
      { class: `meanwhile mw-${mode}` },
      this.title,
      h("div", { class: "mw-col cn" }, h("span", { class: "mw-flag" }, "🇨🇳"), this.cn.el, h("span", { class: "mw-unit" }, "AI models"), this.notes[0]),
      h("div", { class: "mw-col us" }, h("span", { class: "mw-flag" }, "🇺🇸"), this.us.el, h("span", { class: "mw-unit" }, "AI models"), this.notes[1]),
      h("div", { class: "mw-col eu" }, h("span", { class: "mw-flag" }, "🇪🇺"), h("span", { class: "mw-pair" }, this.regs.el, h("span", { class: "mw-plus" }, " + "), this.forms.el), h("span", { class: "mw-unit" }, "regulations + forms"), this.notes[2]),
    );
  }

  set(m: Meanwhile | null, estimated = false): void {
    this.el.hidden = !m;
    if (!m) return;
    this.cn.set(m.china.models);
    this.us.set(m.us.models);
    this.regs.set(m.eu.regulations);
    this.forms.set(m.eu.forms);
    [m.china.note, m.us.note, m.eu.note].forEach((n, i) => (this.notes[i]!.textContent = n));
    this.title.textContent =
      this.mode === "case"
        ? `MEANWHILE — while this file was being processed (${elapsedText(m.elapsedSec)})`
        : `MEANWHILE — today, while Europe processed applications${estimated ? " (estimated at current EU rates)" : ""}`;
  }
}
