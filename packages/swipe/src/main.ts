import "./styles.css";
import { Sfx } from "./audio";
import { Leaderboard, startSession, type Entry, type Session } from "./api";
import {
  CARD_MS,
  KIND_STAMP,
  Round,
  maxScore,
  meanwhile,
  meanwhileLine,
  quipFor,
  rankFor,
  resolveSwipe,
  verdictLine,
  type Answer,
  type Verdict,
} from "./game";
import { shareCard } from "./share";

const params = new URLSearchParams(location.search);
const MOCK = params.get("mock") === "1";
const EMBED = params.get("embed") === "1";
const ARCADE_URL = "/game/";
const WARDEN_URL = "https://warden.pro7ocol.com/analyze/";
const PUBLIC_URL = "https://eurocrat.pro7ocol.com/swipe/";
const NAME_KEY = "eurocrat.arcade.name";
const REVEAL_AUTO_MS = 6000;

const app = document.getElementById("app")!;
const sfx = new Sfx();
const store = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

document.body.classList.toggle("embed", EMBED);

let session: Session | null = null;
let sessionPromise: Promise<Session> = startSession(MOCK);
let board: Leaderboard | null = null;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function post(msg: Record<string, unknown>): void {
  try {
    (window as unknown as { webkit?: { messageHandlers?: { eurocrat?: { postMessage(m: unknown): void } } } }).webkit?.messageHandlers?.eurocrat?.postMessage(msg);
  } catch {
    /* not in WKWebView */
  }
  if (window.parent && window.parent !== window) window.parent.postMessage(msg, "*");
}

function chrome(inner: string): string {
  return `
  <header class="bar">
    <a class="bar-back" href="${ARCADE_URL}">← Arcade</a>
    <div class="bar-title"><strong>LEGAL OR BANNED?</strong><span>Eurocrat Arcade · Form SW-20/AI</span></div>
    ${MOCK ? `<span class="mock">MOCK</span>` : ""}
  </header>
  <main class="screen">${inner}</main>`;
}

function leaderboardHtml(entries: Entry[], highlight?: { name: string; score: number }): string {
  if (!entries.length) return `<p class="lb-empty">Register empty. Be the first applicant of the day.</p>`;
  return `<ol class="lb">${entries
    .map(
      (e) =>
        `<li class="${highlight && e.name === highlight.name && e.score === highlight.score ? "me" : ""}"><span>${esc(e.name)}</span><b>${e.score}</b></li>`,
    )
    .join("")}</ol>`;
}

async function getBoard(): Promise<Leaderboard> {
  session = await sessionPromise;
  board ??= new Leaderboard(session, store);
  return board;
}

/* ---------------- title ---------------- */

function showTitle(): void {
  app.innerHTML = chrome(`
    <section class="title">
      <p class="formno">Application No. SW-${new Date().getFullYear()}/${Math.floor(Math.random() * 9000 + 1000)} · Annex none</p>
      <h1>Legal<br/>or <span>Banned?</span></h1>
      <p class="rules">Swipe <b>left = BANNED</b>, <b>right = ALLOWED</b> in the EU. 20 pitches, 8 s each, streaks pay. The law is real.</p>
      <div class="demo-cards" aria-hidden="true">
        <div class="mini l">BANNED</div><div class="mini c">?</div><div class="mini r">ALLOWED</div>
      </div>
      <button class="btn primary big" id="start">Open the file</button>
      <p class="hint">Keyboard: ← / → to judge, Enter to continue.</p>
      <div class="today"><h2>Today's register</h2><div id="lb">…</div></div>
    </section>`);
  const start = document.getElementById("start")!;
  start.addEventListener("click", () => {
    sfx.unlock();
    void startRound();
  });
  start.focus();
  void getBoard()
    .then((b) => b.top(5))
    .then((entries) => {
      const el = document.getElementById("lb");
      if (el) el.innerHTML = leaderboardHtml(entries);
    });
}

/* ---------------- play ---------------- */

interface Play {
  round: Round;
  startedAt: number;
  cardStart: number;
  phase: "question" | "reveal" | "anim";
  raf: number;
  lastTick: number;
  revealTimer: number;
}

let play: Play | null = null;

async function startRound(): Promise<void> {
  const s = await sessionPromise;
  session = s;
  board = new Leaderboard(s, store);
  const round = new Round(s.seed);
  app.innerHTML = chrome(`
    <section class="play">
      <div class="hud">
        <span class="hud-n"><small>FILE</small><b id="n">1/${round.deck.length}</b></span>
        <span class="hud-score"><small>SCORE</small><b id="score">0</b></span>
        <span class="hud-streak"><small>STREAK</small><b id="streak">0</b></span>
      </div>
      <div class="timer"><i id="timer"></i></div>
      <div class="table" id="table">
        <div class="hint-l">← BANNED</div><div class="hint-r">ALLOWED →</div>
        <div class="card-wrap" id="wrap">
          <div class="card" id="card">
            <div class="face front" id="front"></div>
            <div class="face back" id="back"></div>
          </div>
        </div>
      </div>
      <div class="actions">
        <button class="btn judge banned" id="b-banned">✕ BANNED</button>
        <button class="btn judge allowed" id="b-allowed">ALLOWED ✓</button>
      </div>
    </section>`);
  play = { round, startedAt: performance.now(), cardStart: 0, phase: "question", raf: 0, lastTick: 0, revealTimer: 0 };
  document.getElementById("b-banned")!.addEventListener("click", () => judge("banned"));
  document.getElementById("b-allowed")!.addEventListener("click", () => judge("allowed"));
  bindDrag();
  nextCard();
}

function nextCard(): void {
  const p = play!;
  clearTimeout(p.revealTimer);
  const card = p.round.current;
  if (!card) return finish();
  const cardEl = document.getElementById("card")!;
  const wrap = document.getElementById("wrap")!;
  cardEl.classList.remove("flipped");
  wrap.classList.remove("in");
  wrap.style.transform = "";
  void wrap.offsetWidth;
  wrap.classList.add("in");
  document.getElementById("front")!.innerHTML = `
    <div class="form-head"><span>APPLICATION FOR MARKET ACCESS</span><span>Ref. ${esc(card.id.toUpperCase().slice(0, 14))}</span></div>
    <p class="label">Product description (max. 1 sentence)</p>
    <p class="pitch">${esc(card.pitch)}</p>
    <div class="ovl ovl-b">BANNED</div><div class="ovl ovl-a">ALLOWED</div>
    <p class="foot">Swipe ← BANNED · ALLOWED →</p>`;
  document.getElementById("n")!.textContent = `${p.round.index + 1}/${p.round.deck.length}`;
  setJudgeEnabled(true);
  p.phase = "question";
  p.cardStart = performance.now();
  p.lastTick = 0;
  cancelAnimationFrame(p.raf);
  p.raf = requestAnimationFrame(tick);
}

function setJudgeEnabled(on: boolean): void {
  for (const id of ["b-banned", "b-allowed"]) (document.getElementById(id) as HTMLButtonElement).disabled = !on;
}

function tick(now: number): void {
  const p = play;
  if (!p || p.phase !== "question") return;
  const left = CARD_MS - (now - p.cardStart);
  const bar = document.getElementById("timer");
  if (bar) {
    bar.style.transform = `scaleX(${Math.max(0, left / CARD_MS)})`;
    bar.classList.toggle("low", left < 3000);
  }
  const sec = Math.ceil(left / 1000);
  if (left < 3000 && sec !== p.lastTick && left > 0) {
    p.lastTick = sec;
    sfx.tick();
  }
  if (left <= 0) {
    judge(null);
    return;
  }
  p.raf = requestAnimationFrame(tick);
}

function judge(choice: Verdict | null): void {
  const p = play;
  if (!p || p.phase !== "question") return;
  cancelAnimationFrame(p.raf);
  const msLeft = CARD_MS - (performance.now() - p.cardStart);
  const a = p.round.answer(choice, msLeft);
  p.phase = "anim";
  setJudgeEnabled(false);
  sfx.stamp();
  setTimeout(() => (a.correct ? sfx.right() : sfx.wrong()), 120);
  reveal(a);
}

function reveal(a: Answer): void {
  const p = play!;
  const wrap = document.getElementById("wrap")!;
  const cardEl = document.getElementById("card")!;
  const back = document.getElementById("back")!;
  const c = a.card;
  const you = a.choice === null ? "nothing (time ran out)" : a.choice.toUpperCase();
  const quip = quipFor(c);
  back.innerHTML = `
    <div class="form-head"><span>DECISION OF THE COMMISSION</span><span>${a.correct ? "CORRECT" : "INCORRECT"}</span></div>
    <div class="stamp ${c.verdict}">${c.verdict === "banned" ? "BANNED" : "ALLOWED"}</div>
    <p class="you ${a.correct ? "ok" : "ko"}">${a.correct ? "✓" : "✕"} You said ${you}.${a.correct ? ` <b>+${a.points}</b>` : a.choice === null ? " Application deemed withdrawn." : " Streak lost."}</p>
    <p class="basis"><b>${esc(KIND_STAMP[c.kind])}</b> — ${esc(c.basis)}.</p>
    ${quip ? `<p class="quip">${esc(quip)}</p>` : ""}
    <a class="chip" href="${esc(c.url)}" target="_blank" rel="noopener">§ ${esc(c.ref)} · EUR-Lex ↗</a>
    <p class="foot">Tap to continue</p>`;
  back.title = verdictLine(c);
  wrap.style.transition = "transform .25s ease-out";
  wrap.style.transform = "";
  cardEl.classList.add("flipped");
  wrap.classList.toggle("shake", !a.correct);
  document.getElementById("score")!.textContent = String(p.round.score);
  const st = document.getElementById("streak")!;
  st.textContent = String(p.round.streak);
  st.parentElement!.classList.toggle("hot", p.round.streak >= 3);
  setTimeout(() => {
    if (!play || play !== p) return;
    p.phase = "reveal";
    wrap.style.transition = "";
    p.revealTimer = window.setTimeout(advance, REVEAL_AUTO_MS);
  }, 380);
}

function advance(): void {
  const p = play;
  if (!p || p.phase !== "reveal") return;
  clearTimeout(p.revealTimer);
  document.getElementById("wrap")?.classList.remove("shake");
  if (p.round.done) finish();
  else nextCard();
}

function bindDrag(): void {
  const table = document.getElementById("table")!;
  const wrap = document.getElementById("wrap")!;
  let id: number | null = null;
  let x0 = 0;
  let dx = 0;
  let samples: { x: number; t: number }[] = [];
  let pending = false;

  const paint = () => {
    pending = false;
    wrap.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    const w = table.clientWidth || 1;
    const f = Math.min(1, Math.abs(dx) / (w * 0.25));
    wrap.style.setProperty("--b", dx < 0 ? String(f) : "0");
    wrap.style.setProperty("--a", dx > 0 ? String(f) : "0");
  };

  table.addEventListener("pointerdown", (e) => {
    sfx.unlock();
    if ((e.target as HTMLElement).closest("a")) return;
    if (!play) return;
    if (play.phase === "reveal") {
      advance();
      return;
    }
    if (play.phase !== "question") return;
    id = e.pointerId;
    x0 = e.clientX;
    dx = 0;
    samples = [{ x: e.clientX, t: e.timeStamp }];
    wrap.style.transition = "none";
    table.setPointerCapture(e.pointerId);
  });
  table.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    dx = e.clientX - x0;
    samples.push({ x: e.clientX, t: e.timeStamp });
    if (samples.length > 5) samples.shift();
    if (!pending) {
      pending = true;
      requestAnimationFrame(paint);
    }
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    const s0 = samples[0];
    const s1 = samples[samples.length - 1];
    const vx = s1 && s0 && s1.t > s0.t ? (s1.x - s0.x) / (s1.t - s0.t) : 0;
    const v = resolveSwipe(dx, vx, table.clientWidth);
    wrap.style.setProperty("--b", "0");
    wrap.style.setProperty("--a", "0");
    if (v && play?.phase === "question") judge(v);
    else {
      wrap.style.transition = "transform .2s ease-out";
      wrap.style.transform = "";
    }
    dx = 0;
  };
  table.addEventListener("pointerup", end);
  table.addEventListener("pointercancel", end);
}

/* ---------------- end ---------------- */

const missedAssets = new Set<string>();

function officerImg(score: number): string {
  const expr = score >= maxScore() * 0.6 ? "smug" : "appalled";
  const url = `/assets/generated/cutout/formblatt-${expr}.png`;
  return missedAssets.has(url) ? "" : `<img class="officer" src="${url}" alt="" data-src="${url}" />`;
}

function finish(): void {
  const p = play!;
  play = null;
  cancelAnimationFrame(p.raf);
  const durationMs = Math.round(performance.now() - p.startedAt);
  const st = p.round.stats();
  const rank = rankFor(st.score);
  const mw = meanwhileLine(meanwhile(durationMs));
  const misses = p.round.answers.filter((a) => !a.correct);
  sfx.fanfare();
  post({ type: "score", game: "swipe", ...st, rank: null, title: rank.title, durationMs });

  const savedName = store?.getItem(NAME_KEY) ?? "";
  app.innerHTML = chrome(`
    <section class="end">
      <div class="end-head">
        ${officerImg(st.score)}
        <div>
          <p class="formno">Final decision · Form SW-20/AI</p>
          <p class="big-score">${st.score}</p>
          <p class="stats">${st.correct}/${st.total} correct · best streak ${st.bestStreak}${st.timeouts ? ` · ${st.timeouts} withdrawn` : ""}</p>
        </div>
      </div>
      <div class="rank-stamp r${rank.index}">${esc(rank.title)}</div>
      <p class="meanwhile"><b>Meanwhile.</b> ${esc(mw)}</p>
      <form class="file" id="file">
        <label for="name">Name for the register</label>
        <div class="row"><input id="name" maxlength="24" autocomplete="nickname" placeholder="Anonymous applicant" value="${esc(savedName)}" />
        <button class="btn primary" id="submit">File score</button></div>
        <p class="field-msg" id="msg"></p>
      </form>
      <div class="today"><h2>Today's register</h2><div id="lb">…</div></div>
      <div class="end-actions">
        <button class="btn primary big" id="again">Play again</button>
        <button class="btn big" id="share">Share card</button>
      </div>
      <a class="warden" href="${WARDEN_URL}" target="_blank" rel="noopener">Analyse your own idea for real →</a>
      ${misses.length ? `<details class="misses"><summary>Your misjudgements (${misses.length})</summary><ul>${misses
        .map((a) => `<li><p>${esc(a.card.pitch)}</p><a href="${esc(a.card.url)}" target="_blank" rel="noopener">${esc(verdictLine(a.card))}</a></li>`)
        .join("")}</ul></details>` : ""}
      <a class="back-link" href="${ARCADE_URL}">← Back to the Eurocrat Arcade</a>
    </section>`);

  const img = app.querySelector<HTMLImageElement>("img.officer");
  img?.addEventListener("error", () => {
    missedAssets.add(img.dataset.src ?? "");
    img.remove();
  });

  const b = board!;
  const lbEl = document.getElementById("lb")!;
  const refresh = (me?: Entry) => b.top(10).then((e) => (lbEl.innerHTML = leaderboardHtml(e, me)));
  void refresh();

  const form = document.getElementById("file") as HTMLFormElement;
  const msg = document.getElementById("msg")!;
  const submit = document.getElementById("submit") as HTMLButtonElement;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = (document.getElementById("name") as HTMLInputElement).value.trim().slice(0, 24) || "Anonymous applicant";
    store?.setItem(NAME_KEY, name);
    submit.disabled = true;
    msg.textContent = "Filing…";
    const r = await b.submit({
      name,
      score: st.score,
      durationMs,
      stats: { correct: st.correct, wrong: st.wrong, timeouts: st.timeouts, total: st.total, bestStreak: st.bestStreak },
    });
    msg.textContent = `Filed. Rank #${r.rank} today${r.mode === "local" ? " (on this device)" : ""}.`;
    post({ type: "rank", game: "swipe", score: st.score, rank: r.rank, title: rank.title });
    void refresh({ name, score: st.score });
  });

  document.getElementById("again")!.addEventListener("click", () => {
    sessionPromise = startSession(MOCK);
    board = null;
    void startRound();
  });
  const shareBtn = document.getElementById("share") as HTMLButtonElement;
  shareBtn.addEventListener("click", async () => {
    shareBtn.disabled = true;
    const r = await shareCard({ score: st.score, title: rank.title, correct: st.correct, total: st.total, bestStreak: st.bestStreak, meanwhile: mw, url: PUBLIC_URL });
    shareBtn.disabled = false;
    if (r === "downloaded") msg.textContent = "Share card downloaded.";
  });
  (document.getElementById("again") as HTMLButtonElement).focus();
}

/* ---------------- keyboard ---------------- */

window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).tagName === "INPUT") return;
  if (play) {
    if (play.phase === "question") {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") judge("banned");
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") judge("allowed");
      else return;
    } else if (play.phase === "reveal") {
      if (["Enter", " ", "ArrowLeft", "ArrowRight"].includes(e.key)) advance();
      else return;
    } else return;
    e.preventDefault();
  }
});

showTitle();
