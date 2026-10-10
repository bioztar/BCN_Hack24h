/** /game/ — the Eurocrat Arcade landing: four tiles, today's top score each. */
import "./shared/base.css";
import "./arcade.css";
import { leaderboard, type GameId } from "./shared/api";
import { EMBED, MOCK, esc, fmt, withFlags } from "./shared/env";
import { starRingSvg } from "./shared/stars";

interface Tile {
  id: GameId;
  href: string;
  form: string;
  title: string;
  blurb: string;
  stamp: string;
  accent: string;
  unit: (n: number) => string;
}

const TILES: Tile[] = [
  { id: "whack", href: "/game/whack/", form: "Form WAM-45", title: "Whack-a-Model", blurb: "Stamp every non-European model. Do NOT stamp Mistral.", stamp: "VERBOTEN", accent: "#c8102e", unit: (n) => `${fmt(n)} pts` },
  { id: "swipe", href: "/swipe/", form: "Form LOB-20", title: "Legal or Banned?", blurb: "Swipe left to ban, right to allow. The law is real; the comedy is too.", stamp: "PROHIBITED", accent: "#1a7f37", unit: (n) => `${fmt(n)} pts` },
  { id: "flappy", href: "/flappy/", form: "Form RF-27", title: "Regulatory Flappy", blurb: "Flap your startup between GDPR, DORA, NIS2 and the rest.", stamp: "DISSOLVED", accent: "#e07b00", unit: (n) => `${fmt(n)} pillar${n === 1 ? "" : "s"}` },
  { id: "triplicate", href: "/triplicate/", form: "Form A-38", title: "In Triplicate", blurb: "Falling forms. Three DG inboxes. Three of a kind gets approved.", stamp: "IN TRIPLICATE", accent: "#6b3fa0", unit: (n) => `${fmt(n)} pts` },
];

const linkExtra: Record<string, string> = EMBED ? { arcade: "1" } : {};
const app = document.getElementById("app")!;
if (EMBED) document.body.classList.add("embed");

app.innerHTML = `
<header class="arc-head">
  <div class="arc-emblem">${starRingSvg(38, 6)}</div>
  <div class="arc-title">
    <strong>EUROCRAT ARCADE</strong>
    <span>Directorate-General for Recreational Compliance</span>
  </div>
  ${MOCK ? '<span class="mock-badge">MOCK</span>' : ""}
</header>
<main class="arc-main">
  <p class="arc-lede">Four procedures. One single market. Today's best officers are listed on each file.</p>
  <div class="arc-grid">
    ${TILES.map(
      (t) => `
      <a class="arc-tile" style="--accent:${t.accent}" href="${withFlags(t.href, linkExtra)}">
        <span class="form-no">${esc(t.form)} — application for recreation</span>
        <b class="arc-name">${esc(t.title)}</b>
        <span class="arc-blurb">${esc(t.blurb)}</span>
        <span class="arc-top" data-top="${t.id}">Today's top: <i>retrieving the register…</i></span>
        <span class="arc-stamp">${esc(t.stamp)}</span>
        <span class="btn primary arc-play">Begin procedure ›</span>
      </a>`,
    ).join("")}
  </div>
</main>
<footer class="arc-foot">
  ${EMBED ? "" : `<a href="${withFlags("/pocket/")}">‹ Back to the roast</a><span>·</span>`}
  <span>Ref. COM(2026) 451 final — leaderboards reset at midnight, Brussels time</span>
</footer>`;

for (const t of TILES) {
  void leaderboard(t.id, 1).then(({ entries }) => {
    const top = entries[0];
    const slot = app.querySelector(`[data-top="${t.id}"]`);
    if (!slot) return;
    slot.innerHTML = top ? `Today's top: <b>${esc(t.unit(top.score))}</b> — ${esc(top.name)}` : "Today's top: <i>no officer has filed yet</i>";
  });
}
