import { MOCK } from "../env";
import { h } from "../dom";

export function emblem(): HTMLElement {
  const stars = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return h("i", { style: `left:${50 + 38 * Math.sin(a)}%;top:${50 - 38 * Math.cos(a)}%` }, "★");
  });
  return h("div", { class: "emblem", "aria-hidden": "true" }, stars);
}

/** Institutional header + footer around a screen. */
export function chrome(main: HTMLElement, form: string): HTMLElement {
  return h(
    "div",
    { class: "chrome" },
    h(
      "header",
      { class: "eu-header" },
      emblem(),
      h("div", { class: "eu-title" }, h("strong", null, "European Commission"), h("span", null, "Directorate-General for the Refusal of Startups (DG ROAST)")),
      h("div", { class: "eu-meta" }, h("span", null, "EN ▾"), h("span", null, "Accessibility statement (pending)"), MOCK ? h("span", { class: "mock-badge" }, "REHEARSAL — ?mock=1") : null),
    ),
    h("nav", { class: "eu-crumbs" }, "Home › Policies › Innovation › Refusal of innovation › ", h("b", null, form)),
    h("main", { class: "eu-main" }, main),
    h(
      "footer",
      { class: "eu-footer" },
      h("span", null, `Form ${form}`),
      h("span", null, "Ref. Ares(2026)4812771 — 10/10/2026"),
      h("span", null, "All officials are fictional. Every citation is real."),
      h("span", null, "Last update: before the building."),
    ),
  );
}
