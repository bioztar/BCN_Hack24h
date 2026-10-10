import "./style.css";
import { EMBED, MOCK, bestScore, leaderboard, postScoreToHost, saveName, savedName, startSession, submitScore, type Board, type Session } from "./api";
import { buzz, isMuted, setMuted, sfx, unlockAudio } from "./audio";
import { shareCard } from "./card";
import { PICKUP_REGS, flap, meanwhileLine, newGame, rankFor, step, type State, type Verdict } from "./logic";
import { draw, layout, type View } from "./render";

const ARCADE_URL = "/game/";
const app = document.getElementById("app")!;
if (EMBED) document.body.classList.add("embed");

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

const canvas = el("canvas", "playfield");
const g = canvas.getContext("2d", { alpha: false })!;
const hud = el("div", "hud");
const hudForm = el("div", "hud-form", "FORM FL-1 · PILLARS PASSED");
const hudScore = el("div", "hud-score", "0");
const hudRank = el("div", "hud-rank", "");
const muteBtn = el("button", "icon-btn mute", "");
muteBtn.setAttribute("aria-label", "Toggle sound");
hud.append(hudForm, hudScore, hudRank);
const hint = el("div", "hint", "Tap · click · Space to flap");
const toasts = el("div", "toasts");
const overlay = el("div", "overlay");
app.append(canvas, hud, hint, toasts, muteBtn, overlay);

let view: View = layout(1, 1);
function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = app.clientWidth;
  const h = app.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  view = layout(canvas.width, canvas.height);
}
window.addEventListener("resize", resize);
resize();

const renderMute = (): void => {
  muteBtn.textContent = isMuted() ? "🔇" : "🔊";
};
renderMute();
muteBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  setMuted(!isMuted());
  renderMute();
});

type Screen = "title" | "play" | "crash" | "end";
let screen: Screen = "title";
let st: State = newGame(1);
let session: Session | null = null;
let pendingSession: Promise<Session> = startSession();
let lastFlap = -1e9;
let shakeUntil = 0;
let endShownAt = 0;
let lastRankTitle = "";

function toast(html: string, kind = ""): void {
  const t = el("div", `toast ${kind}`);
  t.innerHTML = html;
  toasts.append(t);
  setTimeout(() => t.classList.add("out"), 2300);
  setTimeout(() => t.remove(), 2700);
  while (toasts.children.length > 2) toasts.firstElementChild?.remove();
}

async function freshSession(): Promise<Session> {
  let s = await pendingSession;
  if (Date.now() - s.at > 90_000) s = await startSession();
  pendingSession = startSession();
  return s;
}

async function play(): Promise<void> {
  unlockAudio();
  session = await freshSession();
  st = newGame(session.seed);
  screen = "play";
  lastRankTitle = rankFor(0).rank.title;
  overlay.innerHTML = "";
  overlay.className = "overlay";
  hud.classList.add("on");
  hint.classList.add("on");
  hudScore.textContent = "0";
  hudRank.textContent = lastRankTitle;
}

function onFlap(): void {
  if (screen !== "play") return;
  unlockAudio();
  if (st.phase === "ready") hint.classList.remove("on");
  flap(st);
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function handleEvents(now: number): void {
  for (const e of st.events) {
    if (e.type === "flap") {
      lastFlap = now;
      sfx.flap();
    } else if (e.type === "score") {
      sfx.point();
      hudScore.textContent = String(e.score);
      hudScore.classList.remove("pop");
      void hudScore.offsetWidth;
      hudScore.classList.add("pop");
      const r = rankFor(e.score).rank.title;
      if (r !== lastRankTitle) {
        lastRankTitle = r;
        hudRank.textContent = r;
        toast(`<b>PROMOTED</b> · ${esc(r)}`, "gold");
      }
    } else if (e.type === "pickup") {
      const reg = PICKUP_REGS[e.kind];
      buzz(20);
      if (e.kind === "sandbox") {
        sfx.pickup();
        toast(`<b>REGULATORY SANDBOX</b> · 3 s immunity. The sand is not yet harmonised. <i>${esc(reg.label)}</i>`, "sand");
      } else {
        sfx.warp();
        toast(`<b>DELEGATED ACT</b> · Annex III amended. Pillars relocated. <i>${esc(reg.label)}</i>`, "gold");
      }
    } else if (e.type === "bounce") sfx.bounce();
    else if (e.type === "crash") crash(e.verdict, now);
  }
  st.events.length = 0;
}

function crash(v: Verdict, now: number): void {
  screen = "crash";
  sfx.crash();
  buzz(60);
  shakeUntil = now + 380;
  hint.classList.remove("on");
  overlay.className = "overlay crash";
  overlay.innerHTML = "";
  const stamp = el("div", "big-stamp");
  stamp.append(el("div", "", "DISSOLVED"), el("small", "", `by ${v.reg.label}`));
  overlay.append(stamp);
  setTimeout(() => sfx.stamp(), 120);
  setTimeout(() => void showEnd(v), 1300);
}

function formHead(title: string, sub: string): HTMLElement {
  const h = el("div", "form-head");
  const flag = el("div", "eu-flag");
  const t = el("div", "form-head-text");
  t.append(el("strong", "", title), el("span", "", sub));
  h.append(flag, t);
  return h;
}

function boardList(b: Board, highlight?: { name: string; score: number }): HTMLElement {
  const box = el("div", "board");
  const head = el("div", "board-head", b.local ? (MOCK ? "Register of the day · this device (mock)" : "Register of the day · this device") : "Register of the day · all applicants");
  const ol = el("ol");
  let marked = false;
  for (const e of b.entries) {
    const li = el("li");
    li.append(el("span", "", e.name), el("b", "", String(e.score)));
    if (!marked && highlight && e.name === highlight.name && e.score === highlight.score) {
      li.classList.add("me");
      marked = true;
    }
    ol.append(li);
  }
  if (!b.entries.length) ol.append(el("li", "empty", "No applications filed yet. Be the first to be dissolved."));
  box.append(head, ol);
  return box;
}

function titleScreen(): void {
  screen = "title";
  hud.classList.remove("on");
  hint.classList.remove("on");
  overlay.className = "overlay title";
  overlay.innerHTML = "";
  const sheet = el("div", "sheet");
  sheet.append(formHead("Regulatory Flappy", "Eurocrat Arcade · Form FL-1 · Application for passage through the Single Market"));
  if (MOCK) sheet.append(el("div", "mock-badge", "MOCK MODE · LOCAL REGISTER"));
  sheet.append(el("p", "rules", "Tap to flap your startup through the pillars of EU law — one pillar passed is one point; touch one and you are dissolved."));
  const legend = el("div", "legend");
  legend.innerHTML = `<div><span class="dot sand"></span><b>Regulatory sandbox</b> — 3 s of immunity (${esc(PICKUP_REGS.sandbox.label)})</div><div><span class="dot da"></span><b>Delegated act</b> — the next pillars start moving (${esc(PICKUP_REGS.delegated.label)})</div>`;
  sheet.append(legend);
  const start = el("button", "btn primary big pulse", "Submit application ▸");
  start.addEventListener("click", () => void play());
  sheet.append(start);
  const best = bestScore();
  if (best > 0) sheet.append(el("div", "best", `Your best: ${best} pillars · ${rankFor(best).rank.title}`));
  const boardHost = el("div");
  sheet.append(boardHost);
  void leaderboard(false).then((b) => boardHost.replaceChildren(boardList({ ...b, entries: b.entries.slice(0, 5) })));
  if (!EMBED) {
    const back = el("a", "back", "← Eurocrat Arcade");
    back.href = ARCADE_URL;
    sheet.append(back);
  }
  overlay.append(sheet);
}

async function showEnd(v: Verdict): Promise<void> {
  screen = "end";
  endShownAt = performance.now();
  hud.classList.remove("on");
  const score = st.score;
  const durationMs = st.t;
  const prevBest = bestScore();
  const best = bestScore(score);
  const { rank, next } = rankFor(score);
  const meanwhile = meanwhileLine(durationMs);
  const fileNo = (st.seed >>> 0).toString(16).toUpperCase().padStart(8, "0");
  const s = session!;

  overlay.className = "overlay end";
  overlay.innerHTML = "";
  const sheet = el("div", "sheet");
  sheet.append(formHead("Notice of Dissolution", `Form FL-27/B · File ${fileNo}`));
  const sc = el("div", "score-row");
  sc.innerHTML = `<div><div class="score-big">${score}</div><div class="score-lbl">pillar${score === 1 ? "" : "s"} passed</div></div><div class="score-side"><div>Best: <b>${best}</b>${score > prevBest && score > 0 ? ' <span class="new">NEW</span>' : ""}</div><div>Rank: <b>${esc(rank.title)}</b></div>${next ? `<div class="muted">Next: ${esc(next.title)} at ${next.min}</div>` : ""}</div>`;
  sheet.append(sc);

  const cause = el("div", "cause");
  const verb = v.cause === "floor" ? `Lost altitude ahead of <b>${esc(v.reg.label)}</b>` : `Dissolved by <b>${esc(v.reg.label)}</b>`;
  cause.innerHTML = `<div class="cause-h">${verb} — ${esc(v.reg.title)}</div><p>${esc(v.reg.fact)}</p><a href="${esc(v.reg.url)}" target="_blank" rel="noopener">Read ${esc(v.reg.label)} on EUR-Lex ↗</a>`;
  sheet.append(cause);
  sheet.append(el("div", "meanwhile", meanwhile));

  const again = el("button", "btn primary big", "Play again ▸");
  again.addEventListener("click", () => void play());
  const share = el("button", "btn", "Share card");
  share.addEventListener("click", async () => {
    share.disabled = true;
    try {
      const r = await shareCard({ score, rank: rank.title, killer: v.reg, meanwhile, fileNo });
      share.textContent = r === "downloaded" ? "Card saved" : "Share card";
    } catch {
      share.textContent = "Could not render";
    } finally {
      share.disabled = false;
    }
  });
  const row = el("div", "row");
  row.append(share);
  if (!EMBED) {
    const back = el("a", "btn", "Arcade");
    back.href = ARCADE_URL;
    row.append(back);
  }
  sheet.append(again, row);

  const file = el("form", "file");
  const input = el("input");
  input.maxLength = 24;
  input.placeholder = "Startup name for the register";
  input.value = savedName();
  input.autocomplete = "off";
  const fileBtn = el("button", "btn", "File score");
  fileBtn.type = "submit";
  const status = el("div", "status");
  file.append(input, fileBtn);
  const boardHost = el("div");
  sheet.append(file, status, boardHost);
  overlay.append(sheet);

  const stats = { flaps: st.stats.flaps, sandboxes: st.stats.sandboxes, delegatedActs: st.stats.delegatedActs, killedBy: v.reg.id, cause: v.cause };
  let filed = false;
  const fileScore = async (): Promise<void> => {
    if (filed) return;
    const name = input.value.trim().slice(0, 24);
    if (!name) {
      status.textContent = "A name is required. Everything requires a name.";
      return;
    }
    filed = true;
    saveName(name);
    file.classList.add("done");
    status.textContent = "Filing in triplicate…";
    const r = await submitScore({ name, score, durationMs, session: s, stats });
    status.textContent = r.rank ? `Filed. You are #${r.rank} in the ${r.local ? "local " : ""}register.` : "Filed. Your rank is pending a delegated act.";
    postScoreToHost({ score, rank: r.rank, rankTitle: rank.title, durationMs: Math.round(durationMs), name, stats });
    const b = await leaderboard(r.local);
    boardHost.replaceChildren(boardList(b, { name, score }));
  };
  file.addEventListener("submit", (e) => {
    e.preventDefault();
    input.blur();
    void fileScore();
  });
  if (input.value && score > 0) void fileScore();
  else {
    if (score === 0) postScoreToHost({ score, rank: null, rankTitle: rank.title, durationMs: Math.round(durationMs), stats });
    void leaderboard(s.local).then((b) => boardHost.replaceChildren(boardList(b)));
  }
}

// Input
const interactive = (t: EventTarget | null): boolean => t instanceof Element && !!t.closest("button, a, input, form, .sheet");
window.addEventListener(
  "pointerdown",
  (e) => {
    if (interactive(e.target)) return;
    if (screen === "play") {
      e.preventDefault();
      onFlap();
    }
  },
  { passive: false },
);
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW" || e.code === "Enter") {
    if (e.repeat) return;
    e.preventDefault();
    if (screen === "play") onFlap();
    else if (screen === "title") void play();
    else if (screen === "end" && performance.now() - endShownAt > 700) void play();
  } else if (e.code === "KeyM") {
    setMuted(!isMuted());
    renderMute();
  }
});
document.addEventListener("visibilitychange", () => {
  last = performance.now();
});

// Loop
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(100, now - last);
  last = now;
  if (screen === "play" || screen === "title") step(st, document.hidden ? 0 : dt);
  handleEvents(now);
  draw(g, view, st, now, lastFlap, now < shakeUntil ? 10 : 0);
  requestAnimationFrame(frame);
}
titleScreen();
requestAnimationFrame(frame);
if (MOCK) (window as unknown as { __flappy?: () => State }).__flappy = () => st;
