import type { Persona } from "../contract";
import { h, fmtInt, sleep } from "../dom";
import { portrait } from "../stage/official";
import { chime, tick, unlockAudio } from "../stage/sfx";
import { chrome } from "./chrome";

const FLAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.";

/** Airport split-flap: each character spins, then settles left to right. */
export async function flap(el: HTMLElement, text: string, ms = 1400): Promise<void> {
  const target = text.toUpperCase();
  const cells = [...target].map(() => h("span", { class: "flap" }, " "));
  el.replaceChildren(...cells);
  const t0 = performance.now();
  for (;;) {
    const t = performance.now() - t0;
    let settled = 0;
    cells.forEach((c, i) => {
      const at = (i / Math.max(1, cells.length)) * ms * 0.7 + ms * 0.3;
      if (t >= at) {
        c.textContent = target[i] === " " ? "\u00a0" : target[i]!;
        settled++;
      } else c.textContent = target[i] === " " ? "\u00a0" : FLAP[Math.floor(Math.random() * FLAP.length)]!;
    });
    if (Math.random() < 0.5) tick();
    if (settled === cells.length) return;
    await sleep(55);
  }
}

/** Gag 2 + the allocation board. */
export function queueTicket(root: HTMLElement, officers: [Persona, Persona], pair: string, caseTicket: number): Promise<void> {
  return new Promise((resolve) => {
    const num = h("span", { class: "ticket-num" }, fmtInt(caseTicket));
    const serving = h("b", null, "0003");
    const note = h("p", { class: "ticket-note" });
    const ticket = h(
      "div",
      { class: "ticket" },
      h("div", { class: "ticket-head" }, "DG ROAST · Visitor Services · Counter 7 of 1"),
      h("p", null, "You are number"),
      num,
      h("p", { class: "ticket-wait" }, "Estimated wait: ", h("b", null, "the next Multiannual Financial Framework"), "."),
      h("p", { class: "ticket-serving" }, "Now serving: ", serving),
      note,
      h("div", { class: "ticket-tear" }),
    );
    const pairRow = h("div", { class: "board-pair" });
    const rows = officers.map((p, i) => {
      const name = h("div", { class: "board-cell name" });
      const unit = h("div", { class: "board-cell unit" });
      const status = h("div", { class: "board-cell status" });
      const pic = h("div", { class: "board-pic" }, portrait(p));
      const row = h("div", { class: "board-row", style: `--accent:${p.color}` }, pic, h("div", { class: "board-text" }, name, unit), h("div", { class: "board-cell gate" }, `B-${12 + i}`), status);
      return { row, name, unit, status, pic, p };
    });
    const go = h("button", { class: "btn primary big", disabled: true }, "Proceed to submission ▸");
    const board = h(
      "section",
      { class: "board", hidden: true },
      h("h2", null, "Your file has been allocated to…"),
      h("div", { class: "board-head" }, h("span", null, "Officer"), h("span", null, "Gate"), h("span", null, "Status")),
      pairRow,
      rows.map((r) => r.row),
      go,
    );
    root.replaceChildren(chrome(h("div", { class: "queue" }, ticket, board), "Q(2026) 4812 final"));

    const bump = setInterval(() => {
      serving.textContent = "0002";
      note.textContent = "Now serving has been revised downwards for procedural reasons.";
    }, 1300);

    (async () => {
      await sleep(2600);
      board.hidden = false;
      chime();
      await flap(pairRow, `PAIR · ${pair}`, 900);
      for (const r of rows) {
        r.pic.classList.add("flip");
        await Promise.all([flap(r.name, r.p.name, 1300), flap(r.unit, r.p.title.slice(0, 48), 1300)]);
        r.status.textContent = "ALLOCATED";
        r.status.classList.add("blink");
      }
      clearInterval(bump);
      note.textContent = "Please proceed. Do not run. Running is a separate procedure.";
      go.disabled = false;
      go.focus();
    })();

    go.addEventListener("click", () => {
      unlockAudio();
      clearInterval(bump);
      resolve();
    });
  });
}
