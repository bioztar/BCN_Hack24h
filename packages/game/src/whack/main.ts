import "../shared/base.css";
import "./whack.css";
import modelsData from "../models.json";
import type { Model } from "../core/models";
import { meanwhile } from "../core/meanwhile";
import { COMBO_CAP, rankDelta, rankTitle } from "../core/rules";
import { leaderboard, saveName, savedName, startRound, submitScore, type Entry, type Ticket } from "../shared/api";
import { Sfx } from "../shared/audio";
import { postScore } from "../shared/bridge";
import { EMBED, FROM_ARCADE, MOCK, esc, fmt, withFlags } from "../shared/env";
import { shareCard } from "../shared/share";
import { Hand } from "./hand";
import { buildBoard, Round, type RoundResult } from "./round";

const POOL = (modelsData as { models: Model[] }).models;
const sfx = new Sfx();
const app = document.getElementById("app")!;
if (EMBED) document.body.classList.add("embed");

function grain(): string {
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(96, 96);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
    img.data[i + 3] = Math.random() < 0.13 ? 0 : 150 + Math.random() * 105;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}
document.documentElement.style.setProperty("--grain", `url(${grain()})`);

const showArcade = !EMBED || FROM_ARCADE;
app.innerHTML = `
<div class="stage" id="stage">
  <header class="hud">
    <div class="hud-block"><span class="hud-label">Score</span><b class="hud-score" id="score">0</b></div>
    <div class="hud-block combo" id="combo-box"><span class="hud-label">Combo</span><b id="combo">×1</b></div>
    <div class="hud-block right"><span class="hud-label">Time</span><b id="time">45.0</b></div>
    <button class="mute" id="mute" aria-label="Sound">${sfx.muted ? "🔇" : "🔊"}</button>
    <div class="timebar"><i id="bar"></i></div>
  </header>
  <div class="board-wrap">
    <div class="board" id="board"></div>
    <div class="banned" id="banned" hidden>YOU BANNED THE ONLY ONE WE HAD</div>
  </div>
  <footer class="fine-print">Form WAM-45/EC · Directorate-General for the Single Market of Models · Names and colours only; no logos were harmed</footer>
</div>
<section class="screen" id="title">
  <div class="paper card">
    <div class="form-no">Form EU/WAM-01 — Application to protect the single market</div>
    ${MOCK ? '<span class="mock-badge">MOCK — local leaderboard</span>' : ""}
    <h1>EUROCRAT — <span>WHACK-A-MODEL</span></h1>
    <p class="mission">Your mission: protect the single market. Stamp every non-European model. <b>Do NOT stamp Mistral.</b></p>
    <ul class="rules">
      <li><b>+100 × combo</b> per non-EU model stamped</li>
      <li><b>−25</b> if one escapes into the single market (fines start after the 8-second transition period)</li>
      <li><b>−500</b> for stamping Mistral 🇪🇺 — gold ring, "MADE IN EU". The only one we had.</li>
    </ul>
    <label class="field">Name of officer <input id="name" maxlength="24" autocomplete="nickname" placeholder="Anonymous stagiaire" /></label>
    <button class="btn primary big" id="play">Begin procedure</button>
    <div class="row">
      <button class="btn small" id="lb-open">Today's leaderboard</button>
      ${showArcade ? `<a class="btn small" href="${withFlags("/game/")}">‹ Arcade</a>` : ""}
      ${EMBED ? "" : `<a class="btn small" href="${withFlags("/pocket/")}">Back to the roast</a>`}
    </div>
  </div>
</section>
<section class="screen" id="countdown" hidden>
  <div class="count"><b id="count-n">3</b><span id="count-t">Pending approval…</span></div>
</section>
<section class="screen" id="end" hidden><div class="paper card" id="end-card"></div></section>
<section class="screen" id="lb" hidden>
  <div class="paper card">
    <div class="form-no">Register of today's officers — Whack-a-Model</div>
    <ol class="lb-list" id="lb-list"></ol>
    <p class="lb-empty" id="lb-note" hidden></p>
    <button class="btn primary big" id="lb-close">Close the register</button>
  </div>
</section>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $("stage");
const holes = buildBoard($("board"));
const hand = new Hand(stage, () => {
  const r = $("board").getBoundingClientRect();
  return { x: r.right - r.width * 0.14, y: r.bottom - r.height * 0.02 };
});
const LAST_SCORE = "eurocrat.whack.lastScore";
function lastScore(): number | null {
  try {
    const v = localStorage.getItem(LAST_SCORE);
    return v === null || !Number.isFinite(Number(v)) ? null : Number(v);
  } catch {
    return null;
  }
}
function saveLastScore(n: number): void {
  try {
    localStorage.setItem(LAST_SCORE, String(n));
  } catch {
    /* private mode */
  }
}
const scoreEl = $("score");
const comboEl = $("combo");
const comboBox = $("combo-box");
const timeEl = $("time");
const bar = $("bar");
const nameInput = $<HTMLInputElement>("name");
nameInput.value = savedName();

const screens = ["title", "countdown", "end", "lb"] as const;
type Screen = (typeof screens)[number];
let back: Screen = "title";
function show(s: Screen | null): void {
  for (const id of screens) $(id).hidden = id !== s;
}

const hud = {
  score(n: number, delta: number) {
    scoreEl.textContent = fmt(n);
    if (delta) scoreEl.animate([{ transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 160 });
  },
  combo(n: number) {
    comboEl.textContent = `×${Math.max(1, Math.min(n, COMBO_CAP))}`;
    comboBox.classList.toggle("hot", n >= 3);
  },
  time(left: number, frac: number) {
    timeEl.textContent = (Math.max(0, left) / 1000).toFixed(1);
    bar.style.transform = `scaleX(${frac})`;
    timeEl.classList.toggle("low", left < 10_000);
  },
};

$("mute").addEventListener("click", () => ($("mute").textContent = sfx.toggleMute() ? "🔇" : "🔊"));
document.addEventListener("pointerdown", () => sfx.unlock(), { capture: true });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let replays = 0;

async function countdown(): Promise<void> {
  const fast = replays++ > 0;
  show("countdown");
  const n = $("count-n");
  const t = $("count-t");
  n.className = "";
  for (const k of ["3", "2", "1"]) {
    n.textContent = k;
    t.textContent = "Pending approval…";
    n.animate([{ transform: "scale(1.6)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 220, easing: "ease-out" });
    sfx.beep(520, 0.1);
    await wait(fast ? 320 : 700);
  }
  n.textContent = "APPROVED.";
  n.className = "approved";
  t.textContent = "Proceed.";
  sfx.approved();
  n.animate([{ transform: "rotate(-8deg) scale(2.2)", opacity: 0 }, { transform: "rotate(-8deg) scale(1)", opacity: 1 }], { duration: 160, easing: "ease-in", fill: "forwards" });
  await wait(fast ? 380 : 650);
}

let round: Round | null = null;

async function play(): Promise<void> {
  saveName(nameInput.value);
  const ticketP = startRound("whack");
  await countdown();
  const ticket = await ticketP;
  show(null);
  round = new Round(stage, holes, $("banned"), hud, sfx, POOL, ticket.seed, (r) => void finish(ticket, r), hand);
  round.start();
}

function statRow(k: string, v: string): string {
  return `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
}

async function finish(ticket: Ticket, r: RoundResult): Promise<void> {
  sfx.bell();
  const { tally } = r;
  const title = rankTitle(tally.score);
  const delta = rankDelta(lastScore(), tally.score);
  saveLastScore(tally.score);
  const mw = meanwhile(r.seed, r.durationMs);
  const name = savedName() || "Anonymous stagiaire";
  const ref = r.seed.slice(0, 6).toUpperCase();
  const card = $("end-card");
  card.innerHTML = `
    <div class="form-no">Decision No. WAM/2026/${ref} — notice of performance</div>
    <div class="end-score"><span>Final score</span><b>${fmt(tally.score)}</b></div>
    <div class="end-rank">Rank: <b>${esc(title)}</b></div>
    <div class="end-delta ${delta.kind}">${esc(delta.line)}</div>
    <div class="end-place" id="place">Filing your result with the register…</div>
    <div class="stats">
      ${statRow("Non-EU models stamped", fmt(tally.hits))}
      ${statRow("Mistral accidents", fmt(tally.mistralHits))}
      ${statRow("Best streak", fmt(tally.bestCombo))}
      ${statRow("Escaped into the single market", fmt(tally.escapes))}
    </div>
    <p class="meanwhile"><b>Meanwhile.</b> ${esc(mw.line)}</p>
    ${tally.mistralHits ? `<p class="verdict bad">You stamped Mistral ${tally.mistralHits === 1 ? "once" : `${tally.mistralHits} times`}. A delegated act has been opened in your name.</p>` : `<p class="verdict ok">Mistral was spared. The single market thanks you.</p>`}
    <div class="end-stamp">${tally.mistralHits ? "RENVOYÉ EN COMMISSION" : "APPROVED"}</div>
    <button class="btn primary big" id="again">Play again — file another application</button>
    <button class="btn gold big" id="share">Share the decision</button>
    <div class="row">
      <button class="btn small" id="end-lb">Leaderboard</button>
      ${showArcade ? `<a class="btn small" href="${withFlags("/game/")}">‹ Arcade</a>` : ""}
      ${EMBED ? "" : `<a class="btn small" href="${withFlags("/pocket/")}">Back to the roast</a>`}
    </div>`;
  show("end");
  card.querySelector(".end-stamp")!.animate([{ transform: "rotate(-12deg) scale(2.4)", opacity: 0 }, { transform: "rotate(-12deg) scale(1)", opacity: 0.85 }], { duration: 220, delay: 250, easing: "ease-in", fill: "both" });
  if (delta.kind === "up") setTimeout(() => sfx.approved(), 400);
  const again = $("again");
  again.addEventListener("click", () => void play(), { once: true });
  again.focus({ preventScroll: true });
  $("end-lb").addEventListener("click", () => void openLeaderboard("end"));
  $("share").addEventListener("click", async () => {
    const res = await shareCard(
      {
        game: "Whack-a-Model",
        score: fmt(tally.score),
        title,
        lines: [
          `${fmt(tally.hits)} non-EU models stamped · best streak ${tally.bestCombo}`,
          tally.mistralHits ? `Stamped Mistral ×${tally.mistralHits}. The only one we had.` : "Mistral spared. The single market thanks you.",
          `Meanwhile: 🇨🇳 ${mw.china} new models · 🇺🇸 ${mw.us} · 🇪🇺 ${mw.regulations} regulations + ${mw.forms} forms`,
        ],
        stamp: tally.mistralHits ? "RENVOYÉ" : "APPROVED",
        footer: "eurocrat.pro7ocol.com/game/ — protect the single market",
        formNo: `DECISION No. WAM/2026/${ref} — ${name.toUpperCase()}`,
      },
      `eurocrat-whack-${tally.score}.png`,
      `I scored ${fmt(tally.score)} in EUROCRAT Whack-a-Model — rank: ${title}. Stamp every non-EU model; do NOT stamp Mistral.`,
    );
    if (res === "downloaded") $("share").textContent = "Saved to your files ✓";
  });
  const rank = await submitScore(ticket, { name, score: tally.score, durationMs: r.durationMs, stats: { hits: tally.hits, mistralHits: tally.mistralHits, bestCombo: tally.bestCombo, escapes: tally.escapes }, title });
  const place = $("place");
  place.innerHTML = rank ? `Registered as <b>#${rank}</b> today${ticket.local ? " (on this device)" : ""}.` : "The register declined your file. Your result stands, unofficially.";
  postScore({ type: "score", game: "whack", score: tally.score, rank, title, name, durationMs: r.durationMs, hits: tally.hits, mistralHits: tally.mistralHits, bestCombo: tally.bestCombo });
}

function renderEntries(entries: Entry[]): string {
  return entries
    .map(
      (e) =>
        `<li class="${e.mine ? "mine" : ""}"><span class="lb-rank">#${e.rank}</span><span class="lb-name">${esc(e.name)}</span><span class="lb-score">${fmt(e.score)}</span><span class="lb-title">${esc(e.title ?? rankTitle(e.score))}</span></li>`,
    )
    .join("");
}

async function openLeaderboard(from: Screen): Promise<void> {
  back = from;
  show("lb");
  const list = $("lb-list");
  const note = $("lb-note");
  list.innerHTML = "";
  note.hidden = false;
  note.textContent = "Retrieving the register…";
  const { entries, local } = await leaderboard("whack", 20);
  list.innerHTML = renderEntries(entries);
  note.hidden = entries.length > 0 && !local;
  note.textContent = entries.length ? "Local register (this device only)." : "No officers have filed today. Be the first stagiaire.";
}

$("play").addEventListener("click", () => void play());
nameInput.addEventListener("keydown", (e) => e.key === "Enter" && void play());
$("lb-open").addEventListener("click", () => void openLeaderboard("title"));
$("lb-close").addEventListener("click", () => show(back));
show("title");
