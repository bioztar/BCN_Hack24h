import "./style.css";
import { Leaderboard, type BoardEntry, type Session } from "./api";
import { buzz, isMuted, setMuted, sfx, unlockAudio } from "./audio";
import { DGS, formById, type FormDef } from "./forms";
import { bestPlacement, createGame, drainEvents, steer, hardDrop, move, nextPiece, rotate, update, type Game, type GameEvent } from "./game";
import { drawBoard, drawNext, layout, newView } from "./render";
import { fmtDuration, meanwhileLine, rankFor } from "./rules";
import { shareCard } from "./share";

const params = new URLSearchParams(location.search);
const MOCK = params.has("mock") && params.get("mock") !== "0";
const EMBED = params.has("embed") && params.get("embed") !== "0";
const ARCADE = "/game/";
const PUBLIC_URL = "https://eurocrat.pro7ocol.com/triplicate/";
if (EMBED) document.body.classList.add("embed");

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const dgOf = (f: FormDef) => DGS.find((d) => d.id === f.dg);
const chip = (f: FormDef) => (f.label && f.url ? `<a class="chip" href="${f.url}" target="_blank" rel="noopener">${esc(f.label)}</a>` : "");

$("#app").innerHTML = `
  <header class="top">
    <a class="back" href="${ARCADE}">← Arcade</a>
    <div class="brand"><span class="form-no">FORM TRP-3/EU</span><b>IN TRIPLICATE</b></div>
    <div class="hud">
      <div class="stat"><small>SCORE</small><b id="score">0</b></div>
      <div class="stat"><small>LVL</small><b id="level">1</b></div>
      <div class="next-box"><small>NEXT</small><canvas id="next"></canvas></div>
      <button class="icon-btn" id="mute" aria-label="Sound">${isMuted() ? "🔇" : "🔊"}</button>
      <button class="icon-btn" id="pause" aria-label="Pause">Ⅱ</button>
    </div>
  </header>
  <main class="stage">
    <aside class="side">
      <div class="panel"><h3>RULES OF PROCEDURE</h3>
        Each form belongs to one Directorate-General. Three correctly filed forms in a row are
        <b>APPROVED IN TRIPLICATE</b>. A wrong inbox stamps it <b>RENVOYÉ</b>: grey, and back to the queue.
        A <b>simplification package</b> repeals the grey forms in its inbox.</div>
      <div class="panel"><h3>CONTROLS</h3>
        <kbd>←</kbd> <kbd>→</kbd> move · <kbd>↑</kbd> rotate<br><kbd>↓</kbd> soft drop · <kbd>Space</kbd> drop · <kbd>P</kbd> pause<br>
        <span class="muted">Touch: swipe to move, tap to rotate, swipe down to drop.</span></div>
    </aside>
    <div class="well">
      <div class="ticker" id="ticker">Steer each form into its Directorate-General's inbox.</div>
      <div class="board-wrap" id="wrap"><canvas id="board"></canvas>
        <div class="stamp" id="stamp">APPROVED<small>IN TRIPLICATE</small></div>
        <div class="toast" id="toast"></div>
      </div>
      <div class="trays" id="trays">${DGS.map((d) => `<div class="tray" style="--c:${d.color}"><b>${d.name}</b><small>${d.remit}</small></div>`).join("")}</div>
    </div>
    <aside class="side">
      <div class="panel"><h3>DOSSIER</h3><ul class="dossier" id="dossier"><li class="muted" style="border:0">Nothing filed yet.</li></ul></div>
      <div class="panel"><h3>REGISTER OF TODAY</h3><ol class="board-list" id="side-board"></ol></div>
    </aside>
  </main>
  <nav class="pad" id="pad">
    <button data-a="left" aria-label="Left">◀</button>
    <button data-a="rotate" aria-label="Rotate">⟳</button>
    <button data-a="drop" class="drop" aria-label="Drop">⤓ DROP</button>
    <button data-a="right" aria-label="Right">▶</button>
  </nav>
  <div class="overlay open" id="title"><div class="sheet">
    <div class="form-no">FORM TRP-3/EU · DIRECTORATE-GENERAL FOR DOCUMENT THROUGHPUT</div>
    <h1>IN TRIPLICATE</h1>
    <p class="rule">Steer each falling form into its DG's inbox — three right forms in a row are <b>APPROVED IN TRIPLICATE</b>; a wrong inbox sends it back to the queue.</p>
    <div class="legend">${DGS.map((d) => `<div style="--c:${d.color}"><b>${d.name}</b>${d.remit}</div>`).join("")}</div>
    <button class="btn primary wide" id="start">Take a number</button>
    <p class="hint">${matchMedia("(pointer: coarse)").matches ? "Swipe to move · tap to rotate · swipe down to drop." : "← → move · ↑ rotate · ↓ soft drop · Space drop."}</p>
    <h2 style="font-size:14px;margin-top:14px">Register of today</h2>
    <ol class="board-list" id="title-board"><li class="muted">Consulting the register…</li></ol>
    ${MOCK ? `<span class="mock-badge">MOCK — local register only</span>` : ""}
    <p class="hint arcade-link"><a href="${ARCADE}">← Eurocrat Arcade</a></p>
  </div></div>
  <div class="overlay" id="paused"><div class="sheet">
    <div class="form-no">NOTICE OF SUSPENSION</div>
    <h2>Procedure suspended</h2>
    <p class="rule">Your file is on hold, pending your return. Nothing is lost. Nothing moves. As usual.</p>
    <button class="btn primary wide" id="resume">Resume the procedure</button>
  </div></div>
  <div class="overlay" id="over"><div class="sheet" id="over-sheet"></div></div>
`;

const canvas = $<HTMLCanvasElement>("#board");
const ctx = canvas.getContext("2d")!;
const nextCanvas = $<HTMLCanvasElement>("#next");
const view = newView();
const board = new Leaderboard(MOCK);

let game: Game | null = null;
let session: Session | null = null;
let state: "title" | "playing" | "paused" | "over" = "title";
let lastNextKey = "";
const dossier: { form: FormDef; bad: boolean }[] = [];

function relayout(): void {
  layout(view, canvas);
  $("#trays").style.width = `${view.cw * 3 + 4}px`;
  lastNextKey = "";
}
addEventListener("resize", relayout);
relayout();

function renderBoardList(el: HTMLElement, entries: BoardEntry[], me?: BoardEntry): void {
  if (!entries.length) {
    el.innerHTML = `<li class="muted">No files approved today. Be the first.</li>`;
    return;
  }
  el.innerHTML = entries
    .slice(0, 8)
    .map((e) => `<li class="${me && e.name === me.name && e.score === me.score ? "me" : ""}">${esc(e.name)} — <b>${e.score.toLocaleString("en-GB")}</b></li>`)
    .join("");
}

async function refreshBoards(me?: BoardEntry): Promise<BoardEntry[]> {
  const { entries } = await board.top(10);
  renderBoardList($("#title-board"), entries, me);
  renderBoardList($("#side-board"), entries, me);
  return entries;
}
void refreshBoards();

// ---------- feedback ----------

function ticker(html: string, bad = false): void {
  const t = $("#ticker");
  t.innerHTML = html;
  t.classList.toggle("bad", bad);
}

function toast(text: string, good = false): void {
  const t = $("#toast");
  t.textContent = text;
  t.classList.toggle("good", good);
  t.classList.remove("show");
  void t.offsetWidth;
  t.classList.add("show");
}

function stamp(chain: number): void {
  const s = $("#stamp");
  s.innerHTML = chain > 1 ? `APPROVED ×${Math.min(chain, 3)}<small>IN TRIPLICATE</small>` : `APPROVED<small>IN TRIPLICATE</small>`;
  s.classList.remove("show");
  void s.offsetWidth;
  s.classList.add("show");
}

function pushDossier(form: FormDef, bad: boolean): void {
  dossier.unshift({ form, bad });
  dossier.length = Math.min(dossier.length, 6);
  $("#dossier").innerHTML = dossier
    .map(({ form: f, bad: b }) => {
      const dg = dgOf(f);
      return `<li class="${b ? "bad" : ""}" style="--c:${dg?.color ?? "#ffcc00"}"><b>${esc(f.code)}</b> ${b ? `→ returned. Belongs to ${dg?.name}.` : esc(f.fact)} ${chip(f)}</li>`;
    })
    .join("");
}

function handle(e: GameEvent, now: number): void {
  switch (e.type) {
    case "move": sfx.move(); break;
    case "rotate": sfx.rotate(); break;
    case "filed": {
      sfx.filed();
      buzz(15);
      const dg = dgOf(e.form);
      ticker(`<b>${esc(e.form.code)}</b> → ${dg ? dg.name : "any inbox"}. ${esc(e.form.fact)}${e.form.label ? ` <b>${esc(e.form.label)}</b>` : ""}`);
      pushDossier(e.form, false);
      break;
    }
    case "junk": {
      sfx.junk();
      buzz(40);
      view.shakeUntil = now + 260;
      const dg = dgOf(e.form);
      ticker(`<b>RENVOYÉ.</b> ${esc(e.form.code)} belongs to ${dg?.name}. Back to the queue.`, true);
      toast("RENVOYÉ — back to the queue");
      pushDossier(e.form, true);
      break;
    }
    case "omnibus":
      sfx.omnibus();
      ticker(`<b>SIMPLIFICATION PACKAGE.</b> ${e.removed} returned ${e.removed === 1 ? "form" : "forms"} repealed in ${DGS[e.col]!.name}. New forms pending.`);
      toast(e.removed ? `${e.removed} ${e.removed === 1 ? "form" : "forms"} repealed. Simplified.` : "Nothing to simplify. Adopted anyway.", true);
      break;
    case "clear":
      sfx.clear(e.chain);
      buzz(30);
      for (const r of e.rows) view.flashes.push({ row: r, t0: now });
      stamp(e.chain);
      break;
    case "level":
      sfx.level();
      toast(`Level ${e.level} — the queue accelerates`, true);
      break;
    case "over":
      sfx.over();
      void finish();
      break;
    case "land":
      break;
  }
}

// ---------- flow ----------

async function start(): Promise<void> {
  unlockAudio();
  $("#title").classList.remove("open");
  $("#over").classList.remove("open");
  session = await board.start();
  game = createGame(session.seed);
  view.born.clear();
  view.flashes = [];
  view.px = game.piece?.x ?? 1;
  dossier.length = 0;
  $("#dossier").innerHTML = `<li class="muted" style="border:0">Nothing filed yet.</li>`;
  ticker("Steer each form into its Directorate-General's inbox.");
  state = "playing";
  relayout();
}

function setPaused(p: boolean): void {
  if (p && state === "playing") state = "paused";
  else if (!p && state === "paused") state = "playing";
  $("#paused").classList.toggle("open", state === "paused");
}

function postScore(msg: Record<string, unknown>): void {
  const w = window as unknown as { webkit?: { messageHandlers?: { eurocrat?: { postMessage(m: unknown): void } } } };
  try { w.webkit?.messageHandlers?.eurocrat?.postMessage(msg); } catch { /* not in the app */ }
  if (window.parent !== window) window.parent.postMessage(msg, "*");
}

async function finish(): Promise<void> {
  if (!game) return;
  state = "over";
  const g = game;
  const rank = rankFor(g.score);
  const stats = { ...g.stats };
  postScore({ type: "score", game: "triplicate", score: g.score, rank, durationMs: Math.round(g.elapsedMs), stats });
  const worst = [...g.returnedBy.entries()].sort((a, b) => b[1] - a[1])[0];
  const worstForm = worst ? formById.get(worst[0]) : undefined;
  const name = localStorage.getItem("triplicate.name") ?? "";
  $("#over-sheet").innerHTML = `
    <div class="form-no">NOTICE OF ARCHIVAL · FORM TRP-3/EU</div>
    <div class="archived">YOUR FILE HAS<br>BEEN ARCHIVED</div>
    <h2>Your file has been archived.</h2>
    <div class="big-score">${g.score.toLocaleString("en-GB")}</div>
    <div class="rank">${esc(rank)}</div>
    <div class="stats">
      <span>Approved in triplicate <b>${stats.rows}</b></span>
      <span>Forms filed <b>${stats.filed}</b></span>
      <span>Returned (RENVOYÉ) <b>${stats.returned}</b></span>
      <span>Best chain <b>×${Math.max(1, stats.bestChain)}</b></span>
      <span>Level reached <b>${stats.level}</b></span>
      <span>Processing time <b>${fmtDuration(g.elapsedMs)}</b></span>
    </div>
    ${worstForm ? `<p class="hint">Most returned: <b>${esc(worstForm.code)}</b> — ${esc(worstForm.title)} ${chip(worstForm)} → ${esc(dgOf(worstForm)?.name ?? "")}</p>` : ""}
    <div class="meanwhile"><b>Meanwhile.</b> ${esc(meanwhileLine(g.elapsedMs))}</div>
    <form class="submit" id="submit-form">
      <input id="name" maxlength="24" placeholder="Name for the register" value="${esc(name)}" autocomplete="nickname" />
      <button class="btn primary" type="submit">Enter in register</button>
    </form>
    <div class="placed" id="placed"></div>
    <ol class="board-list" id="over-board"></ol>
    <div class="row" style="margin-top:12px">
      <button class="btn" id="share">Share card</button>
      <button class="btn primary" id="again">Play again</button>
    </div>
    <p class="hint arcade-link"><a href="${ARCADE}">← Back to the Eurocrat Arcade</a></p>
    ${MOCK ? `<span class="mock-badge">MOCK — local register only</span>` : ""}`;
  $("#over").classList.add("open");
  $("#again").onclick = () => void start();
  $("#share").onclick = async () => {
    const r = await shareCard({ score: g.score, rank, rows: stats.rows, returned: stats.returned, durationMs: g.elapsedMs, url: PUBLIC_URL });
    if (r === "downloaded") $("#share").textContent = "Saved ✓";
  };
  const submitForm = $<HTMLFormElement>("#submit-form");
  submitForm.onsubmit = async (ev) => {
    ev.preventDefault();
    const n = ($<HTMLInputElement>("#name").value.trim() || "Anonymous Applicant").slice(0, 24);
    localStorage.setItem("triplicate.name", n);
    submitForm.querySelector("button")!.setAttribute("disabled", "");
    const res = await board.submit(session!, { name: n, score: g.score, durationMs: Math.round(g.elapsedMs), stats: { ...stats } });
    submitForm.remove();
    $("#placed").textContent = res.rank ? `Registered: #${res.rank} today${res.online ? "" : " (this device)"}.` : "Registered. Rank pending in triplicate.";
    const entries = await refreshBoards({ name: n, score: g.score });
    renderBoardList($("#over-board"), entries, { name: n, score: g.score });
  };
  const { entries } = await board.top(10);
  renderBoardList($("#over-board"), entries);
}

$("#start").onclick = () => void start();
$("#resume").onclick = () => setPaused(false);
$("#pause").onclick = () => setPaused(state === "playing");
$("#mute").onclick = () => {
  setMuted(!isMuted());
  $("#mute").textContent = isMuted() ? "🔇" : "🔊";
};
document.addEventListener("visibilitychange", () => { if (document.hidden) setPaused(true); });

// ---------- input ----------

const act = (a: string) => {
  if (state !== "playing" || !game) return;
  if (a === "left") move(game, -1);
  else if (a === "right") move(game, 1);
  else if (a === "rotate") rotate(game);
  else if (a === "drop") hardDrop(game);
};

addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).tagName === "INPUT") return;
  const k = e.key;
  if (state === "title" && (k === "Enter" || k === " ")) { e.preventDefault(); void start(); return; }
  if (k === "p" || k === "P" || k === "Escape") { setPaused(state === "playing"); return; }
  if (state !== "playing" || !game) return;
  if (k === "ArrowLeft" || k === "a" || k === "A") act("left");
  else if (k === "ArrowRight" || k === "d" || k === "D") act("right");
  else if (k === "ArrowUp" || k === "w" || k === "W" || k === "x" || k === "X") { if (!e.repeat) act("rotate"); }
  else if (k === "ArrowDown" || k === "s" || k === "S") game.softDrop = true;
  else if (k === " " || k === "Enter") { if (!e.repeat) act("drop"); }
  else return;
  e.preventDefault();
});
addEventListener("keyup", (e) => {
  if (game && (e.key === "ArrowDown" || e.key === "s" || e.key === "S")) game.softDrop = false;
});

let repeat: number | undefined;
const stopRepeat = () => {
  clearTimeout(repeat);
  repeat = undefined;
};
for (const b of document.querySelectorAll<HTMLButtonElement>("#pad button")) {
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    unlockAudio();
    const a = b.dataset.a!;
    act(a);
    buzz(6);
    if (a === "left" || a === "right") {
      stopRepeat();
      const again = (delay: number) => {
        repeat = window.setTimeout(() => {
          act(a);
          again(75);
        }, delay);
      };
      again(190);
    }
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, stopRepeat);
}

const wrap = $("#wrap");
let gesture: { id: number; x0: number; y0: number; lx: number; t0: number; moved: boolean; done: boolean } | null = null;
wrap.addEventListener("pointerdown", (e) => {
  unlockAudio();
  gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, t0: performance.now(), moved: false, done: false };
  wrap.setPointerCapture(e.pointerId);
});
wrap.addEventListener("pointermove", (e) => {
  if (!gesture || e.pointerId !== gesture.id || gesture.done || !game) return;
  const step = Math.max(22, view.cw * 0.42);
  while (e.clientX - gesture.lx > step) { act("right"); gesture.lx += step; gesture.moved = true; }
  while (gesture.lx - e.clientX > step) { act("left"); gesture.lx -= step; gesture.moved = true; }
  const dy = e.clientY - gesture.y0;
  const dt = performance.now() - gesture.t0;
  if (dy > view.ch * 1.4 && Math.abs(e.clientX - gesture.x0) < dy && dy / dt > 0.45) {
    act("drop");
    gesture.done = true;
    game.softDrop = false;
  } else if (dy > view.ch * 0.8 && Math.abs(e.clientX - gesture.x0) < dy) {
    game.softDrop = true;
    gesture.moved = true;
  }
});
const endGesture = (e: PointerEvent) => {
  if (!gesture || e.pointerId !== gesture.id) return;
  if (game) game.softDrop = false;
  const dist = Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0);
  if (!gesture.moved && !gesture.done && dist < 12 && performance.now() - gesture.t0 < 350) act("rotate");
  gesture = null;
};
wrap.addEventListener("pointerup", endGesture);
wrap.addEventListener("pointercancel", endGesture);

// ---------- loop ----------

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(50, now - last);
  last = now;
  if (game) {
    if (state === "playing") update(game, dt);
    for (const e of drainEvents(game)) handle(e, now);
    $("#score").textContent = game.score.toLocaleString("en-GB");
    $("#level").textContent = String(game.level);
    const n = nextPiece(game);
    const key = n ? n.map((c) => `${c.dx}${c.dy}${c.form.id}`).join() : "";
    if (key !== lastNextKey) {
      drawNext(nextCanvas, n);
      lastNextKey = key;
    }
    drawBoard(ctx, game, view, now);
  } else {
    if (!idle.piece && !idle.over) idlePiece = 0;
    if (idle.piece && idle.stats.pieces !== idlePiece) {
      idlePiece = idle.stats.pieces;
      const t = bestPlacement(idle);
      if (t) steer(idle, t);
    }
    update(idle, dt);
    drainEvents(idle);
    if (idle.over) idle = createGame(`attract-${now}`);
    drawBoard(ctx, idle, view, now);
  }
  requestAnimationFrame(frame);
}
let idle = createGame("title-screen");
let idlePiece = -1;
if (MOCK) (window as unknown as { __triplicate: unknown }).__triplicate = { game: () => game, best: () => game && bestPlacement(game) };
requestAnimationFrame(frame);
