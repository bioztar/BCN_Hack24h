import { HttpError, type Api } from "./api";
import { buzz, voiceFor, type Playback, type Sound } from "./audio";
import { AudioBook } from "./audiobook";
import { drawBadge } from "./badge";
import { FIXTURE_PERSONAS } from "./fixtures";
import { initials, mergeEntries } from "./leaderboard";
import { estimateMeanwhile, formatElapsed, maxMeanwhile, meanwhileRows } from "./meanwhile";
import { Tween, formatEurFull, formatEurShort, formatJail, meltdownProgress, slotText } from "./meter";
import { mockQuip, mockTicket } from "./mockdata";
import { buildReportPdf } from "./pdf";
import { selfieDataUrl } from "./photo";
import { CAUSES, QUEUE_JOKES, formatPosition, positionAt } from "./queue";
import { initialState, reduce, type Action, type LineEvent, type RoastState } from "./reducer";
import { FineSync, Timeline } from "./timeline";
import type { AnyRoastEvent, ApplicantAuth, FineEvent, LeaderboardEntry, LeaderboardSort, Meanwhile, NoticeV2, CaseMode, Persona, PersonaId, QueueTicket, Submission } from "./types";
import { toNoticeV2, turnoverLine } from "./verdict";
import { isExpress, pivotName, wardenUrl, whackLine, whackResult, type WhackResult } from "./express";

export interface FlowDeps { api: Api; sound: Sound; app: HTMLElement; appUrl: string; }

/** The token stays in memory for this page session only; it is never persisted or shown. */
interface Applicant { applicantId: string | null; applicantToken: string | null; startupName: string; founderName: string; oneLiner: string; photo: string | null; at: number; ticket: QueueTicket; }

let D: FlowDeps;
let me: Applicant | null = null;
const applicantAuth = (): ApplicantAuth | undefined =>
  me?.applicantId && me.applicantToken ? { applicantId: me.applicantId, applicantToken: me.applicantToken } : undefined;
let personas: Persona[] = FIXTURE_PERSONAS;
let shownMw: Meanwhile | null = null;
let serverMwAt = 0;
let myCaseId: string | null = null;
/** Whack-a-Model result from the repo-analysing screen, shown on the verdict. */
let whack: WhackResult | null = null;
/** The last pitch text / repo URL, to prefill the full compliance analyzer. */
let lastPitch = "";
interface AppealFrom { caseId: string; ticket: number; officers: [PersonaId, PersonaId]; notice: NoticeV2; }
/** Bumped on every screen change so stale timers/loops/streams stop. */
let epoch = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const shell = { root: el("div", "v2"), apply: el("div", "v2-pane"), board: el("div", "v2-pane"), tabs: el("nav", "v2-tabs"), tApply: el("button", "on", "📝 Apply"), tBoard: el("button", "", "🏆 Hall of Shame") };

export function startFlow(deps: FlowDeps): void {
  D = deps;
  shell.board.hidden = true;
  shell.tabs.append(shell.tApply, shell.tBoard);
  shell.root.append(shell.apply, shell.board, shell.tabs);
  D.app.replaceChildren(shell.root);
  shell.tApply.addEventListener("click", () => showTab("apply"));
  shell.tBoard.addEventListener("click", () => showTab("board"));
  void D.api.personas().then((p) => (personas = p.length ? p : FIXTURE_PERSONAS));
  if (new URLSearchParams(location.search).get("tab") === "board") showTab("board");
  register();
}

function showTab(t: "apply" | "board"): void {
  shell.apply.hidden = t !== "apply";
  shell.board.hidden = t !== "board";
  shell.tApply.classList.toggle("on", t === "apply");
  shell.tBoard.classList.toggle("on", t === "board");
  if (t === "board") board.open();
}

function screen(cls: string, head?: [string, string]): HTMLDivElement {
  epoch++;
  const s = el("div", `scr ${cls}`);
  if (head) {
    const h = el("div", "scr-head");
    const t = el("div");
    t.append(el("small", "", head[0]), el("strong", "", head[1]));
    h.append(el("div", "eu-flag"), t);
    s.append(h);
  }
  shell.apply.replaceChildren(s);
  shell.apply.scrollTop = 0;
  return s;
}

function field(label: string, input: HTMLInputElement | HTMLTextAreaElement): HTMLLabelElement {
  const f = el("label", "field");
  f.append(el("span", "", label), input);
  return f;
}

// ---------- Meanwhile ----------

function currentMeanwhile(): Meanwhile {
  const local = me ? estimateMeanwhile(me.applicantId ?? me.startupName, (Date.now() - me.at) / 1000) : estimateMeanwhile("x", 0);
  // The server is authoritative once it talks (its counters pause between rounds and its final
  // snapshot is on the badge/PDF); the local estimate only fills the queue and older servers.
  if (!serverMwAt) shownMw = maxMeanwhile(shownMw, local);
  return shownMw ?? local;
}

function onServerMeanwhile(m: Meanwhile): void {
  // The first server sample replaces the local guess, so the verdict's final snapshot never reads lower than the strip.
  shownMw = serverMwAt ? maxMeanwhile(shownMw, m) : m;
  serverMwAt = Date.now();
}

function meanwhileStrip(): HTMLDivElement {
  const box = el("div", "mw");
  const cells = [el("b"), el("b"), el("b")];
  const labels = [el("span", "", "🇨🇳 AI models"), el("span", "", "🇺🇸 AI models"), el("span", "", "🇪🇺 regs · forms")];
  box.append(el("div", "mw-title", "Meanwhile, while you wait…"));
  cells.forEach((c, i) => {
    const d = el("div");
    d.append(c, labels[i]!);
    box.append(d);
  });
  const my = epoch;
  const fmt = (n: number) => Math.floor(n).toLocaleString("en-GB");
  const tick = () => {
    if (my !== epoch) return;
    const m = currentMeanwhile();
    cells[0]!.textContent = fmt(m.china.models);
    cells[1]!.textContent = fmt(m.us.models);
    cells[2]!.textContent = `${fmt(m.eu.regulations)} · ${fmt(m.eu.forms)}`;
    setTimeout(tick, 1000);
  };
  tick();
  return box;
}

function meanwhileCard(m: Meanwhile): HTMLDivElement {
  const c = el("div", "mw-card");
  c.append(el("h3", "", "While you were being processed…"));
  for (const r of meanwhileRows(m)) {
    const p = el("p");
    const t = el("span");
    t.append(el("b", "", r.who + " "), document.createTextNode(r.text));
    p.append(el("i", "", r.flag), t);
    c.append(p);
  }
  c.append(el("small", "", `Time in procedure: ${formatElapsed(m.elapsedSec)}`));
  return c;
}

// ---------- 1. Register ----------

function register(): void {
  const s = screen("reg", ["Eurocrat Commission · DG ROAST", "Form A-1 · Startup Registration"]);
  s.append(el("h1", "", "Pitch your startup. The EU will refuse it. In 15 seconds."));
  const startup = el("input");
  startup.maxLength = 60;
  startup.placeholder = "e.g. Faceify";
  startup.autocomplete = "organization";
  const founder = el("input");
  founder.maxLength = 60;
  founder.placeholder = "Optional — for the leaderboard";
  founder.autocomplete = "name";
  const file = el("input");
  file.type = "file";
  file.accept = "image/*";
  file.setAttribute("capture", "user");
  const selfie = el("label", "selfie");
  const ph = el("span", "ph", "🤳");
  const selfieText = el("span", "", "Add a mugshot for the leaderboard (optional)");
  selfie.append(file, ph, selfieText);
  let photo: string | null = null;
  file.addEventListener("change", async () => {
    const f = file.files?.[0];
    if (!f) return;
    selfieText.textContent = "Notarising your face…";
    photo = await selfieDataUrl(f).catch(() => null);
    if (photo) {
      ph.textContent = "";
      ph.style.backgroundImage = `url("${photo}")`;
      selfieText.textContent = "Face filed. Biometric processing: Art. 9, obviously.";
    } else selfieText.textContent = "Face not accepted (format). Proceed faceless.";
  });
  const err = el("p", "err");
  const go = el("button", "btn primary big", "Get refused →");
  s.append(field("Startup name", startup), err, go, field("Founder (optional)", founder), selfie,
    el("p", "fineprint", "☑ I have read and accepted the 4,212 pages of terms. ☑ I consent to consenting. Satire — your data is used for the joke and the leaderboard only."));
  go.addEventListener("click", async () => {
    const startupName = startup.value.trim();
    const founderName = founder.value.trim() || "A. Nonymous";
    if (!startupName) {
      err.textContent = "INCOMPLET. Your startup needs a name. Any name. We will refuse it either way.";
      startup.focus();
      D.sound.stamp();
      buzz(80);
      return;
    }
    err.textContent = "";
    go.disabled = true;
    go.textContent = "Printing your ticket…";
    D.sound.printer();
    const input: { startupName: string; founderName: string; oneLiner?: string; photo?: string } = { startupName, founderName, ...(photo ? { photo } : {}) };
    let ticket: QueueTicket;
    let applicantId: string | null;
    let applicantToken: string | null;
    try {
      ticket = await D.api.register(input);
      applicantId = ticket.applicantId;
      applicantToken = ticket.applicantToken || null;
    } catch {
      // Older server without /api/applicants: queue locally, pitch without an applicantId.
      ticket = mockTicket();
      applicantId = applicantToken = null;
    }
    me = { applicantId, applicantToken, startupName, founderName, oneLiner: input.oneLiner ?? "", photo, at: Date.now(), ticket };
    shownMw = null;
    serverMwAt = 0;
    queueScreen(ticket);
  });
}

// ---------- 2. Queue ----------

function queueScreen(t: QueueTicket): void {
  const s = screen("queue", ["Directorate-General for Startups", "Waiting room · Window 1"]);
  const my = epoch;
  const tk = el("div", "q-ticket", "Your ticket");
  tk.append(el("b", "", `№ ${t.ticket.toLocaleString("en-GB")}`));
  const giant = el("div", "giant", formatPosition(t.position));
  const joke = el("div", "q-joke", QUEUE_JOKES[0]);
  const better = el("button", "btn big better", "But we're making the world a better place");
  const causes = el("div", "causes");
  const result = el("div");
  causes.hidden = true;
  s.append(tk, el("div", "q-label", "People ahead of you"), giant, el("div", "q-eta", t.etaText), joke, meanwhileStrip(), better, causes, result);

  const start = performance.now();
  let skipped = false;
  let j = 0;
  const jokeTimer = setInterval(() => {
    if (my !== epoch) return clearInterval(jokeTimer);
    joke.textContent = QUEUE_JOKES[++j % QUEUE_JOKES.length]!;
  }, Math.round(Math.min(4200, Math.max(1600, (t.countdownSec * 1000) / 3))));
  const frame = () => {
    if (my !== epoch || skipped) return;
    const pos = positionAt(t.position, (performance.now() - start) / 1000, t.countdownSec);
    giant.textContent = formatPosition(pos);
    if (pos > 0) requestAnimationFrame(frame);
    else yourTurn("Your turn. Window 1 is now open (until 12:00).");
  };
  requestAnimationFrame(frame);

  let quipEl: HTMLElement | null = null;
  let autoGo: number | undefined;
  const yourTurn = (msg: string) => {
    if (my !== epoch) return;
    // No extra tap: on to the pitch unless the cause tiles are open.
    clearTimeout(autoGo);
    autoGo = window.setTimeout(() => my === epoch && causes.hidden && pitchScreen(), skipped ? 2800 : 1600);
    if (quipEl) return void (quipEl.textContent = msg);
    giant.classList.add("front");
    D.sound.ding();
    buzz([40, 30, 40]);
    quipEl = el("div", "quip", msg);
    const go = el("button", "btn primary big pulse", "Proceed to pitch →");
    go.addEventListener("click", () => pitchScreen());
    result.append(quipEl, go);
    better.hidden = skipped;
  };

  better.addEventListener("click", () => {
    causes.hidden = !causes.hidden;
    if (!causes.hidden) causes.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  for (const c of CAUSES) {
    const b = el("button", "tile");
    b.style.setProperty("--c", c.color);
    b.append(el("i", "", c.emoji), el("span", "", c.label), el("small", "", c.desc));
    tileArt(b, c.id);
    b.addEventListener("click", async () => {
      if (skipped) return;
      skipped = true;
      b.classList.add("on");
      causes.querySelectorAll("button").forEach((x) => (x.disabled = true));
      giant.textContent = "…";
      let quip: string;
      let n: number;
      try {
        const auth = applicantAuth();
        if (!auth) throw new Error("local");
        const r = await D.api.betterPlace(auth, c.id);
        quip = r.quip;
        n = r.skipped;
      } catch {
        quip = mockQuip(c.id);
        n = Math.max(1, positionAt(t.position, (performance.now() - start) / 1000, t.countdownSec) - 1);
      }
      if (my !== epoch) return;
      giant.textContent = quipEl ? "0" : "1";
      causes.hidden = true;
      D.sound.approve();
      yourTurn(`${c.emoji} ${quip} You skipped ${n.toLocaleString("en-GB")} applicants.`);
    });
    causes.append(b);
  }
}

// ---------- 3. Pitch ----------

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((m) => MediaRecorder.isTypeSupported?.(m));
}

/** Tap to record, tap to stop → /api/stt → onText. */
function bindMic(btn: HTMLButtonElement, status: HTMLElement, onText: (t: string) => void, onFail: () => void): void {
  let rec: MediaRecorder | null = null;
  btn.addEventListener("click", async () => {
    if (rec) {
      rec.stop();
      return;
    }
    let stream: MediaStream;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("no mic");
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      if (D.api.mock) {
        status.textContent = "No microphone. Transcribing your thoughts instead…";
        onText(await D.api.stt(new Blob()));
        return;
      }
      status.textContent = "Microphone refused by Data Protection. Type instead.";
      onFail();
      return;
    }
    const mime = pickMime();
    const chunks: Blob[] = [];
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = rec?.mimeType || mime || "audio/webm";
      rec = null;
      btn.classList.remove("rec");
      btn.textContent = "🎙";
      status.textContent = "Transcribing into 24 languages…";
      try {
        const text = (await D.api.stt(new Blob(chunks, { type }))).trim();
        status.textContent = text ? "Transcribed. Edit if the interpreter misheard." : "Nothing heard. Silence is not a business model.";
        if (text) onText(text);
      } catch (e) {
        status.textContent = `Interpreter unavailable (${errText(e)}). Type instead.`;
        onFail();
      }
    };
    rec.start();
    btn.classList.add("rec");
    btn.textContent = "■";
    status.textContent = "Recording… tap to stop.";
  });
}

const GITHUB = /^(https?:\/\/)?(www\.)?github\.com\/[\w.-]+\/[\w.-]+\/?(\.git)?$/i;

function pitchScreen(): void {
  const s = screen("pitch", ["Window 1 · Pitch", me ? `${me.startupName} — file opened` : "File opened"]);
  s.append(el("h1", "", "You have one (1) pitch."), el("p", "sub", "Two officers are listening. Both are already disappointed."));
  type Mode = "voice" | "text" | "repo";
  let mode: Mode = "voice";
  let dictated = false;
  const seg = el("div", "seg");
  const btns: Record<Mode, HTMLButtonElement> = { voice: el("button", "", "🎙 Voice"), text: el("button", "", "✍️ Text"), repo: el("button", "", "🐙 GitHub") };
  const voice = el("div");
  const mic = el("button", "mic", "🎙");
  const micStatus = el("div", "mic-status", "Tap, pitch, tap again.");
  voice.append(mic, micStatus);
  const text = el("textarea");
  text.maxLength = 2000;
  text.placeholder = "We're Uber for paperwork, powered by AI, on the blockchain…";
  const textField = field("Your pitch", text);
  const repo = el("input");
  repo.type = "url";
  repo.inputMode = "url";
  repo.placeholder = "https://github.com/you/startup";
  repo.autocapitalize = "off";
  const repoField = field("Public GitHub repository", repo);
  const err = el("p", "err");
  const go = el("button", "btn primary big", "Submit to the Commission");
  const set = (m: Mode) => {
    mode = m;
    (Object.keys(btns) as Mode[]).forEach((k) => btns[k].classList.toggle("on", k === m));
    voice.hidden = m !== "voice";
    textField.hidden = m === "repo";
    repoField.hidden = m !== "repo";
  };
  (Object.keys(btns) as Mode[]).forEach((k) => {
    btns[k].addEventListener("click", () => set(k));
    seg.append(btns[k]);
  });
  bindMic(mic, micStatus, (t) => {
    text.value = t;
    dictated = true;
  }, () => set("text"));
  text.addEventListener("input", () => (dictated = false));
  set("voice");
  s.append(seg, voice, textField, repoField, err, go);
  go.addEventListener("click", () => {
    let sub: Submission;
    if (mode === "repo") {
      const url = repo.value.trim();
      if (!GITHUB.test(url)) {
        err.textContent = "Not a GitHub repository. Format: github.com/owner/repo (public).";
        return;
      }
      sub = { kind: "repo", repoUrl: url.startsWith("http") ? url : `https://${url}` };
    } else {
      const t = text.value.trim();
      if (t.length < 3) {
        err.textContent = mode === "voice" ? "Record your pitch first (or type it)." : "A pitch requires words. At least three letters.";
        return;
      }
      sub = { kind: dictated ? "dictation" : "text", text: t };
    }
    D.sound.unlock();
    void roastScreen(sub);
  });
}

// ---------- 4. Roast ----------

const imgMiss = new Set<string>();

/** Optional poster art for a cause tile; the CSS colour-block tile stands on its own. */
function tileArt(b: HTMLElement, id: string): void {
  const u = `/assets/generated/tiles/${id}.png`;
  if (imgMiss.has(u)) return;
  const im = new Image();
  im.onload = () => {
    b.style.backgroundImage = `url("${u}")`;
    b.classList.add("art");
  };
  im.onerror = () => imgMiss.add(u);
  im.src = u;
}
function stillUrl(p: Persona | undefined, id: PersonaId, expr: string): string[] {
  const own = p?.stills?.[expr as keyof Persona["stills"]];
  return [own, `/assets/generated/cutout/${id}-${expr}.png`, `/assets/generated/still/${id}-${expr}.png`, p?.stills?.neutral, `/assets/generated/cutout/${id}-neutral.png`]
    .filter((u): u is string => !!u && !imgMiss.has(u));
}

/** Sets the first loadable URL; misses are cached so optional art is only tried once. */
function setImg(img: HTMLImageElement, urls: string[], onNone?: () => void): void {
  const [u, ...rest] = urls;
  if (!u) {
    onNone?.();
    return;
  }
  img.onerror = () => {
    imgMiss.add(u);
    setImg(img, rest, onNone);
  };
  img.onload = () => (img.hidden = false);
  if (img.getAttribute("src") !== u) img.src = u;
}

class Officer {
  readonly root = el("div", "officer");
  private img = el("img");
  private ini = el("div", "ini");
  private expr = "";
  burning = false;
  constructor(readonly id: PersonaId, readonly p: Persona | undefined) {
    this.img.alt = p?.name ?? id;
    this.img.hidden = true;
    this.ini.textContent = initials(p?.name ?? id);
    this.ini.style.background = p?.color ?? "#003399";
    this.ini.hidden = true;
    this.root.append(this.img, this.ini, el("div", "heat"), el("div", "tag", p?.name ?? id));
    this.set("neutral");
  }
  set(expr: string): void {
    if (this.burning || expr === this.expr) return;
    this.expr = expr;
    setImg(this.img, stillUrl(this.p, this.id, expr), () => {
      this.img.hidden = true;
      this.ini.hidden = false;
    });
  }
  burn(): void {
    this.burning = true;
    this.root.classList.add("burning");
    const urls = [
      `/assets/generated/cutout/${this.id}-burning.png`,
      `/assets/generated/still/${this.id}-burning.png`,
      `/assets/generated/cutout/${this.id}-appalled.png`,
      ...stillUrl(this.p, this.id, "appalled"),
    ].filter((u) => !imgMiss.has(u));
    setImg(this.img, urls, () => {
      this.img.hidden = true;
      this.ini.hidden = false;
    });
  }
}

/** Canvas flames licking up from the bottom of the duo, plus embers drifting higher. */
function fireCanvas(host: HTMLElement, alive: () => boolean): HTMLCanvasElement {
  const c = el("canvas", "fire");
  const g = c.getContext("2d");
  type P = { x: number; y: number; vx: number; vy: number; life: number; decay: number; r: number; ember: boolean };
  const ps: P[] = [];
  const loop = (t: number) => {
    if (!alive() || !g) return;
    if (!host.closest(".meltdown")) return void requestAnimationFrame(loop);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, w, h);
    const surge = 1 + 0.35 * Math.sin(t / 260);
    for (let i = 0; i < 10 * surge; i++) {
      // Two hot columns, one per officer, plus a ragged floor.
      const col = Math.random() < 0.8 ? (Math.random() < 0.5 ? 0.25 : 0.75) * w + (Math.random() - 0.5) * w * 0.42 : Math.random() * w;
      ps.push({ x: col, y: h + 8, vx: (Math.random() - 0.5) * 0.9, vy: -(1.6 + Math.random() * 3.4) * surge, life: 1, decay: 0.012 + Math.random() * 0.012, r: 16 + Math.random() * 30, ember: false });
    }
    if (Math.random() < 0.6) ps.push({ x: Math.random() * w, y: h * (0.55 + Math.random() * 0.45), vx: (Math.random() - 0.5) * 1.6, vy: -(1 + Math.random() * 2.2), life: 1, decay: 0.004 + Math.random() * 0.006, r: 1 + Math.random() * 2.2, ember: true });
    g.globalCompositeOperation = "lighter";
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]!;
      p.x += p.vx + (p.ember ? Math.sin((t + i * 97) / 180) * 0.6 : 0);
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0 || p.y < -20) {
        ps.splice(i, 1);
        continue;
      }
      if (p.ember) {
        const a = p.life * (0.6 + 0.4 * Math.random());
        g.fillStyle = `rgba(255,${180 + Math.round(60 * p.life)},90,${a})`;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      const r = p.r * (0.35 + p.life * 0.75);
      const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grad.addColorStop(0, `rgba(255,${Math.round(90 + 150 * p.life)},${Math.round(40 * p.life)},${0.5 * p.life})`);
      grad.addColorStop(0.5, `rgba(255,${Math.round(60 * p.life)},0,${0.25 * p.life})`);
      grad.addColorStop(1, "rgba(120,0,0,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return c;
}

async function roastScreen(sub: Submission | null, appeal?: AppealFrom): Promise<void> {
  const s = screen("roast");
  const my = epoch;
  const alive = () => my === epoch;
  let st: RoastState = initialState;
  const timeline = new Timeline();
  const sync = new FineSync();
  const book = new AudioBook();
  const eurT = new Tween(1300);
  const jailT = new Tween(1300);
  let playing = false;
  let speaking: Playback | null = null;
  let officers = new Map<PersonaId, Officer>();
  let caseExpress = Boolean(appeal);

  // Meter
  const meter = el("div", "meter");
  const eurBox = el("div", "eur");
  const eurVal = el("b", "", formatEurFull(0));
  eurBox.append(el("small", "", "FINES"), eurVal);
  const jailBox = el("div", "jail");
  const jailVal = el("b", "", formatJail(0));
  jailBox.append(el("small", "", "JAIL"), jailVal);
  const bar = el("div", "mbar");
  const barFill = el("i");
  bar.append(barFill);
  const barL = el("div", "mbar-l");
  barL.append(el("span", "", "COMPLIANT-ISH"), el("span", "", "🔥 MELTDOWN"));
  meter.append(eurBox, jailBox, bar, barL);
  const tierTag = el("div", "tier-tag", "Case opened — please hold");
  const duo = el("div", "duo");
  const pops = el("div", "pops");
  const bubble = el("div", "bubble");
  bubble.append(el("b", "", "Clerk"), document.createTextNode("Submission received. Please take another number."));
  const ctrl = el("div", "ctrl");
  const status = el("div", "status", "In procedure…");
  ctrl.append(status);
  duo.append(fireCanvas(duo, alive), pops);
  s.append(meter, meanwhileStrip(), tierTag, duo, bubble, ctrl);

  const meterLoop = () => {
    if (!alive()) return;
    const now = performance.now();
    const pe = eurT.progress(now);
    const pj = jailT.progress(now);
    eurVal.textContent = pe < 1 ? slotText(formatEurFull(eurT.value(now)), pe) : formatEurFull(eurT.target);
    jailVal.textContent = pj < 1 ? slotText(formatJail(jailT.value(now)), pj) : formatJail(jailT.target);
    eurBox.classList.toggle("spin", pe < 1);
    jailBox.classList.toggle("spin", pj < 1);
    barFill.style.width = `${Math.round(meltdownProgress(eurT.value(now), jailT.value(now)) * 100)}%`;
    requestAnimationFrame(meterLoop);
  };
  requestAnimationFrame(meterLoop);

  const setOfficers = (ids: PersonaId[], list?: Persona[]) => {
    if (officers.size && ids.every((id) => officers.has(id))) return;
    officers = new Map(ids.map((id) => [id, new Officer(id, list?.find((p) => p.id === id) ?? personas.find((p) => p.id === id))]));
    duo.querySelectorAll(".officer").forEach((o) => o.remove());
    duo.prepend(...[...officers.values()].map((o) => o.root));
  };

  // Analyzing overlay (repo pitches)
  let analyzing: HTMLDivElement | null = null;
  let anaText: HTMLParagraphElement | null = null;
  let anaBar: HTMLElement | null = null;
  // Whack-a-Model while the repo is audited; officer lines wait behind `gate` until the overlay closes.
  let game: HTMLIFrameElement | null = null;
  let goBtn: HTMLButtonElement | null = null;
  let audited = false;
  let gameOver = false;
  let release: (() => void) | null = null;
  let gate: Promise<void> = Promise.resolve();
  const onGameMsg = (e: MessageEvent) => {
    if (!game || e.source !== game.contentWindow) return;
    const r = whackResult(e.data);
    if (!r) return;
    whack = r;
    gameOver = true;
    if (audited) setTimeout(() => alive() && hideAnalyzing(), 2500);
  };
  const showAnalyzing = (stage: string, progress: number) => {
    if (!analyzing) {
      analyzing = el("div", "analyzing");
      const img = el("img");
      img.alt = "";
      anaText = el("p");
      const b = el("div", "bar");
      anaBar = el("i");
      b.append(anaBar);
      analyzing.append(img, el("h2", "", "Analysing your repository…"), anaText, b);
      if (sub?.kind === "repo") {
        const g = (game = el("iframe", "whack"));
        g.src = `/game/whack/?embed=1${D.api.mock ? "&mock=1" : ""}`;
        g.title = "Whack-a-Model";
        g.allow = "autoplay";
        goBtn = el("button", "btn primary big", "Face the officers →");
        goBtn.hidden = true;
        goBtn.addEventListener("click", () => hideAnalyzing());
        analyzing.classList.add("has-game");
        analyzing.append(el("div", "whack-hint", "Meanwhile: stamp every non-EU model. Do NOT stamp Mistral."), g, goBtn);
        gate = new Promise<void>((r) => (release = r));
        window.addEventListener("message", onGameMsg);
      }
      for (let i = 0; i < 18; i++) {
        const p = el("div", "paper");
        p.style.setProperty("--s", (0.6 + Math.random() * 0.9).toFixed(2));
        p.style.animationDuration = `${(1.8 + Math.random() * 1.8).toFixed(2)}s`;
        p.style.left = `${Math.random() * 100}%`;
        p.style.animationDelay = `${(Math.random() * 2.6).toFixed(2)}s`;
        p.style.setProperty("--dx", `${Math.round((Math.random() - 0.5) * 160)}px`);
        p.style.setProperty("--rot", `${Math.round((Math.random() - 0.5) * 1080)}deg`);
        analyzing.append(p);
      }
      s.append(analyzing);
      let k = 0;
      const exprs = ["appalled", "stamping", "appalled", "asleep"];
      const cycle = () => {
        if (!alive() || !analyzing) return;
        const ids = [...officers.keys()];
        const id = ids[k % Math.max(1, ids.length)] ?? "formblatt";
        const expr = exprs[k % exprs.length]!;
        setImg(img, [`/assets/generated/cutout/${id}-${expr}.png`, ...stillUrl(officers.get(id)?.p, id, expr)].filter((u) => !imgMiss.has(u)), () => (img.hidden = true));
        k++;
        setTimeout(cycle, 1100);
      };
      cycle();
      D.sound.rustle();
    }
    anaText!.textContent = stage;
    anaBar!.style.width = `${Math.round(progress * 100)}%`;
  };
  const hideAnalyzing = () => {
    analyzing?.remove();
    analyzing = null;
    window.removeEventListener("message", onGameMsg);
    release?.();
    release = null;
  };
  const auditComplete = () => {
    if (!analyzing) return;
    if (!game) return hideAnalyzing();
    if (audited) return;
    audited = true;
    anaText!.textContent = gameOver ? "Audit complete." : "Audit complete. Finish your round — or face the officers.";
    anaBar!.style.width = "100%";
    goBtn!.hidden = false;
    if (gameOver) setTimeout(() => alive() && hideAnalyzing(), 2500);
  };

  const meltdown = () => {
    if (s.classList.contains("meltdown")) return;
    s.classList.add("meltdown");
    officers.forEach((o) => o.burn());
    duo.append(el("div", "meltdown-banner", "MELTDOWN\nYou broke the Commission"));
    D.sound.council();
    buzz([120, 60, 220, 60, 300]);
  };

  const landFine = (f: FineEvent) => {
    const now = performance.now();
    eurT.set(f.totalEur, now);
    jailT.set(f.totalJailMonths, now);
    const pop = el("div", "pop-fine", `+${formatEurShort(f.amountEur)}${f.jailMonths ? ` · +${formatJail(f.jailMonths)}` : ""} · ${f.provision.label}`);
    if (f.caption) pop.append(el("small", "", f.caption));
    pops.append(pop);
    setTimeout(() => pop.remove(), 2500);
    D.sound.stamp();
    buzz(35);
    officers.forEach((o, id) => o.set(id === st.lines.at(-1)?.speaker ? "smug" : "appalled"));
    if (sync.apply(f)) meltdown();
  };

  const sayLine = (line: LineEvent) => {
    const p = officers.get(line.speaker)?.p ?? personas.find((x) => x.id === line.speaker);
    bubble.replaceChildren(el("b", "", p?.name ?? line.speaker), document.createTextNode(line.text));
    if (line.provisions.length) {
      const pv = el("div", "provs");
      for (const pr of line.provisions) {
        const a = el("a", "", pr.label);
        a.href = pr.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.title = pr.title;
        pv.append(a);
      }
      bubble.append(pv);
    }
    officers.forEach((o, id) => {
      o.root.classList.toggle("talk", id === line.speaker);
      o.set(id === line.speaker ? (line.stamp ? "stamping" : "smug") : (st.tier ?? 1) >= 4 ? "appalled" : "neutral");
    });
    if (line.stamp) D.sound.stamp();
  };

  let idleWaiters: Array<() => void> = [];
  const pump = async () => {
    if (playing) return;
    playing = true;
    try {
      await gate;
      for (let cue = timeline.next(); cue && alive(); cue = timeline.next()) {
        const { line } = cue;
        sayLine(line);
        const fines = cue.fines;
        setTimeout(() => alive() && fines.forEach(landFine), 450);
        let url = line.audioUrl ?? book.get(line.id);
        if (!url && !D.api.mock && D.sound.ready) url = await book.wait(line.id, 1500);
        let pb: Playback;
        try {
          pb = url && D.sound.ready ? await D.sound.play(url) : D.sound.mumble(line.text, voiceFor(line.speaker));
        } catch {
          pb = D.sound.mumble(line.text, voiceFor(line.speaker));
        }
        speaking = pb;
        await Promise.all([pb.done, sleep(Math.min(7000, 900 + line.text.length * 38))]);
        speaking = null;
        await sleep(300);
      }
    } finally {
      playing = false;
      officers.forEach((o) => o.root.classList.remove("talk"));
      const ws = idleWaiters;
      idleWaiters = [];
      ws.forEach((w) => w());
    }
  };
  const idle = () => (playing || timeline.pending ? new Promise<void>((r) => idleWaiters.push(r)) : Promise.resolve());

  const handle = (e: AnyRoastEvent) => {
    switch (e.type) {
      case "officers":
        setOfficers(e.officers.map((o) => o.id), e.officers);
        break;
      case "analyzing":
        showAnalyzing(e.stage, st.analyzing?.progress ?? e.progress);
        break;
      case "intake":
        setTimeout(auditComplete, 600);
        break;
      case "tier":
        tierTag.textContent = `TIER ${e.tier}/5 · ${e.name.toUpperCase()}`;
        tierTag.classList.remove("show");
        void tierTag.offsetWidth;
        tierTag.classList.add("show");
        if (e.tier === 3) D.sound.council();
        else D.sound.ding();
        break;
      case "line":
        auditComplete();
        timeline.addLine(e);
        void pump();
        break;
      case "audio":
        book.set(e.id, e.audioUrl);
        break;
      case "fine": {
        const now = timeline.addFine(e);
        if (now) landFine(now);
        break;
      }
      case "meltdown":
        if (sync.meltdown(e)) meltdown();
        break;
      case "meanwhile":
        onServerMeanwhile(e.meanwhile);
        break;
      default:
        break;
    }
  };
  const dispatch = (a: Action) => {
    st = reduce(st, a);
    if (a.type !== "reset" && a.type !== "submit" && a.type !== "case" && a.type !== "round" && a.type !== "closed" && a.type !== "failed") handle(a);
  };

  const fail = (msg: string) => {
    hideAnalyzing();
    status.textContent = "";
    ctrl.replaceChildren(el("div", "status", `Procedural error: ${msg}. Your file has been lost.`));
    const again = el("button", "btn primary big", "Pitch again");
    again.addEventListener("click", () => pitchScreen());
    ctrl.append(again);
  };

  const runRound = async (caseId: string) => {
    const ctl = new AbortController();
    const stop = setInterval(() => !alive() && ctl.abort(), 500);
    try {
      await D.api.stream(caseId, (e) => alive() && dispatch(e), ctl.signal);
      if (alive()) dispatch({ type: "closed" });
    } catch (err) {
      if (alive()) dispatch({ type: "failed", message: errText(err) });
    } finally {
      clearInterval(stop);
    }
    if (!alive()) return;
    await idle();
    if (!alive()) return;
    if (st.phase === "awaiting") showReply(caseId);
    else if (st.phase === "verdict" && st.notice) {
      if (sync.flush()) meltdown();
      status.textContent = "Verdict being stamped…";
      await sleep(s.classList.contains("meltdown") ? 2200 : 1200);
      if (!alive()) return;
      speaking?.stop();
      myCaseId = caseId;
      const notice = toNoticeV2(st.notice, { ...st, applicantId: me?.applicantId, founderName: me?.founderName, startupName: me?.startupName });
      const ids = [...officers.keys()];
      verdictScreen(notice, caseExpress && !appeal ? { caseId, ticket: st.ticket ?? 0, officers: [ids[0]!, ids[1] ?? ids[0]!], notice } : undefined);
    } else fail(st.error ?? "unknown");
  };

  const showReply = (caseId: string) => {
    ctrl.replaceChildren();
    const ta = el("textarea");
    ta.placeholder = "Argue back. It won't help.";
    ta.maxLength = 1000;
    const mic = el("button", "btn ghost", "🎙");
    const st2 = el("div", "status", st.prompt ?? "The officers await your response.");
    const send = el("button", "btn primary pulse", "Argue back");
    const row = el("div", "row");
    row.append(mic, send);
    ctrl.append(st2, field("Your defence", ta), row);
    bindMic(mic, st2, (t) => (ta.value = t), () => ta.focus());
    send.addEventListener("click", async () => {
      const t = ta.value.trim() || "I would like to speak to your manager.";
      ctrl.replaceChildren(status);
      status.textContent = "Objection filed…";
      try {
        await D.api.reply(caseId, t);
        dispatch({ type: "round" });
        await runRound(caseId);
      } catch (err) {
        fail(errText(err));
      }
    });
  };

  if (appeal) {
    setOfficers(appeal.officers);
    tierTag.textContent = "APPEAL · ONE CHANCE";
    status.textContent = "Appeal under review…";
    eurT.set(appeal.notice.totalEur, performance.now());
    jailT.set(appeal.notice.totalJailMonths, performance.now());
    if (appeal.notice.meltdown) meltdown();
    dispatch({ type: "submit" });
    dispatch({ type: "case", caseId: appeal.caseId, ticket: appeal.ticket });
    await runRound(appeal.caseId);
    return;
  }
  if (!sub) return;
  const submission: Submission = sub;
  lastPitch = submission.text ?? submission.repoUrl ?? "";
  whack = null;
  if (submission.kind === "repo") showAnalyzing("Requesting the repository from the Publications Office…", 0.02);
  try {
    dispatch({ type: "submit" });
    const auth = applicantAuth();
    const mode: CaseMode | undefined = isExpress() ? "express" : undefined;
    const create = (a?: ApplicantAuth) =>
      D.api.createCase(submission, undefined, a, mode).catch((err: unknown) => {
        // The server runs without EXPRESS_MODE (400): fall back to the staged roast.
        if (mode && err instanceof HttpError && err.status === 400) return D.api.createCase(submission, undefined, a);
        throw err;
      });
    const c = await create(auth).catch((err: unknown) => {
      // A rejected token must not cost the audience their roast: pitch anonymously instead.
      if (auth && err instanceof HttpError && (err.status === 401 || err.status === 403)) return create();
      throw err;
    });
    if (!alive()) return;
    caseExpress = c.mode === "express";
    setOfficers(c.officers);
    dispatch({ type: "case", caseId: c.caseId, ticket: c.ticket });
    await runRound(c.caseId);
  } catch (err) {
    if (alive()) fail(errText(err));
  }
}

// ---------- 5. Verdict ----------

async function fetchBlob(url: string, type: RegExp): Promise<Blob | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = await r.blob();
    return type.test(b.type || r.headers.get("content-type") || "") ? b : null;
  } catch {
    return null;
  }
}

/** Play again in one tap: re-register the same founder as a pivot (one case per applicant), straight to the pitch. */
async function pitchAgain(btn: HTMLButtonElement): Promise<void> {
  const prev = me;
  if (!prev) return register();
  const my = epoch;
  btn.disabled = true;
  btn.textContent = "Filing your pivot…";
  const startupName = pivotName(prev.startupName);
  let ticket = prev.ticket;
  let applicantId: string | null = null;
  let applicantToken: string | null = null;
  try {
    ticket = await D.api.register({ startupName, founderName: prev.founderName, ...(prev.photo ? { photo: prev.photo } : {}) });
    applicantId = ticket.applicantId;
    applicantToken = ticket.applicantToken || null;
  } catch { /* pitch anonymously */ }
  if (my !== epoch) return;
  me = { ...prev, applicantId, applicantToken, startupName, at: Date.now(), ticket };
  myCaseId = null;
  pitchScreen();
}

function appealBlock(from: AppealFrom): HTMLDivElement {
  const box = el("div", "v-appeal");
  const grounds = el("input");
  grounds.maxLength = 300;
  grounds.placeholder = "Grounds for appeal (optional, will be ignored)";
  const btn = el("button", "btn big appeal", "⚖️ Appeal (one chance)");
  const msg = el("div", "status");
  box.append(grounds, btn, msg);
  btn.addEventListener("click", async () => {
    const my = epoch;
    btn.disabled = true;
    msg.textContent = "Lodging your appeal in triplicate…";
    try {
      await D.api.appeal(from.caseId, applicantAuth(), grounds.value.trim() || undefined);
      if (my !== epoch) return;
      D.sound.unlock();
      void roastScreen(null, from);
    } catch (err) {
      if (my !== epoch) return;
      const done = err instanceof HttpError && err.status === 409;
      msg.textContent = done ? "Your appeal has been lodged and, naturally, rejected." : `Appeal lost in the post: ${errText(err)}`;
      btn.disabled = done;
    }
  });
  return box;
}

function verdictScreen(n: NoticeV2, appealFrom?: AppealFrom): void {
  const s = screen("verdict", ["Notice of Non-Compliance", n.serial]);
  const my = epoch;
  const mw = n.meanwhile ?? shownMw ?? currentMeanwhile();
  const center = el("div", "v-center");
  center.append(el("div", "v-stamp", n.meltdown ? "MELTDOWN" : "REFUSÉ"));
  const badge = el("img", "badge-img");
  badge.alt = `Eurocrat badge: ${n.startupName} refused, ${formatEurFull(n.totalEur)} fines`;
  const totals = el("div", "v-totals");
  const t1 = el("div");
  t1.append(el("b", "", formatEurFull(n.totalEur)), el("small", "", "fines"));
  const t2 = el("div");
  t2.append(el("b", "", formatJail(n.totalJailMonths)), el("small", "", "jail"));
  totals.append(t1, t2);
  const tl = turnoverLine(n.turnoverEstimate);
  const turnover = tl ? el("p", "v-turnover", tl) : null;
  const share = el("button", "btn primary big", "Share my refusal");
  const saveBadge = el("a", "btn ghost", "Save badge");
  const report = el("a", "btn ghost", "Report (PDF)");
  share.disabled = true;
  const row = el("div", "row");
  row.append(saveBadge, report);
  const actions = el("div", "v-actions");
  actions.append(share, row);

  const list = el("div", "v-list");
  if (n.tldr.length) {
    list.append(el("h3", "", "TL;DR"));
    const ul = el("ul");
    n.tldr.forEach((t) => {
      const li = el("li");
      li.append(el("b", "", `${t.law}: `), document.createTextNode(t.oneLine));
      ul.append(li);
    });
    list.append(ul);
  }
  const fixes = el("div", "v-fixes");
  fixes.append(el("h3", "", "How to make it legal — top 3 fixes"));
  const ol = el("ol");
  n.recommendations.slice(0, 3).forEach((r) => {
    const li = el("li", "", r.text);
    if (r.provision) {
      const a = el("a", "cite-chip", r.provision.label);
      a.href = r.provision.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.title = r.provision.title;
      li.append(" ", a);
    }
    ol.append(li);
  });
  const full = el("a", "btn ghost big", "Get the full compliance report →");
  full.href = wardenUrl(lastPitch || n.startupName);
  full.target = "_blank";
  full.rel = "noopener";
  fixes.append(...(ol.childElementCount ? [ol] : []), full);
  const again = el("button", "btn primary big", "🔁 Pitch another startup");
  again.addEventListener("click", () => void pitchAgain(again));
  const toBoard = el("button", "btn ghost big", "🏆 See the Hall of Shame");
  toBoard.addEventListener("click", () => showTab("board"));
  const money = el("p", "v-money", "Free today · Full compliance dossier €49 · Accelerators: roast your whole cohort — ");
  const contact = el("a", "", "contact");
  contact.href = "mailto:hello@pro7ocol.com?subject=Eurocrat%20%E2%80%94%20roast%20our%20cohort";
  money.append(contact);
  const foot = el("div", "v-actions");
  foot.append(toBoard);
  const banned = whack ? el("p", "v-whack", whackLine(whack)) : null;
  const appealBox = appealFrom ? appealBlock(appealFrom) : null;
  s.append(center, badge, totals, ...([turnover, banned, appealBox] as (HTMLElement | null)[]).filter((x): x is HTMLElement => x !== null), again, fixes, actions, money, meanwhileCard(mw), list, foot);
  D.sound.stamp();
  buzz([60, 40, 60]);

  const slug = n.startupName.replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "startup";
  const shareText = `${n.startupName} was refused by the EU: ${formatEurFull(n.totalEur)} in fines and ${formatJail(n.totalJailMonths)} in jail. Get refused too:`;
  let file: File | null = null;

  void (async () => {
    const withMw = { ...n, meanwhile: mw };
    const blob = (await fetchBlob(n.badgeUrl, /^image\//)) ?? (await drawBadge(withMw, me?.photo ?? null).catch(() => null));
    if (my !== epoch) return;
    if (blob) {
      const url = URL.createObjectURL(blob);
      badge.src = url;
      saveBadge.href = url;
      saveBadge.download = `eurocrat-${slug}.png`;
      file = new File([blob], `eurocrat-${slug}.png`, { type: "image/png" });
    } else badge.hidden = saveBadge.hidden = true;
    share.disabled = false;
  })();
  void (async () => {
    const pdf = (await fetchBlob(n.reportUrl, /pdf/)) ?? buildReportPdf({ ...n, meanwhile: mw });
    if (my !== epoch) return;
    report.href = URL.createObjectURL(pdf);
    report.download = `eurocrat-report-${slug}.pdf`;
  })();

  // navigator.share must be called synchronously from the tap on iOS: the File is prepared above.
  share.addEventListener("click", () => {
    const data: ShareData = { title: "Eurocrat — REFUSÉ", text: shareText, url: D.appUrl };
    const fallback = () => (saveBadge.href ? saveBadge.click() : undefined);
    let p: Promise<void> | null = null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) p = navigator.share({ files: [file], title: data.title, text: `${shareText} ${D.appUrl}` });
      else if (navigator.share) p = navigator.share(data);
    } catch {
      p = null;
    }
    if (!p) return fallback();
    p.catch((err: DOMException) => err?.name !== "AbortError" && fallback());
  });
}

// ---------- 6. Leaderboard ----------

const board = (() => {
  let sort: LeaderboardSort = "fines";
  let entries: LeaderboardEntry[] = [];
  let unsub: (() => void) | null = null;
  let built = false;
  const fresh = new Set<string>();
  const root = el("div", "scr board");
  const ul = el("ul", "lb");
  const tabs = el("div", "board-tabs");
  const tb: Record<LeaderboardSort, HTMLButtonElement> = { fines: el("button", "on", "💶 Fines"), jail: el("button", "", "⛓ Jail"), recent: el("button", "", "🕒 Recent") };

  const render = () => {
    ul.replaceChildren();
    if (!entries.length) {
      ul.append(el("li", "empty", "No one refused yet. Be the first."));
      return;
    }
    entries.forEach((e, i) => {
      const li = el("li");
      if (e.caseId === myCaseId) li.classList.add("mine");
      if (fresh.has(e.caseId)) li.classList.add("fresh");
      const av = el("div", "av", e.photoUrl ? "" : initials(e.startupName));
      if (e.photoUrl) av.style.backgroundImage = `url("${e.photoUrl}")`;
      const who = el("div", "who");
      who.append(el("b", "", `${e.meltdown ? "🔥 " : ""}${e.startupName}`), el("small", "", [e.founderName, e.topLaws.join(" · ")].filter(Boolean).join(" — ")));
      const amt = el("div", "amt", formatEurShort(e.totalEur));
      amt.append(el("small", "", formatJail(e.totalJailMonths)));
      li.append(el("div", "rk", String(i + 1)), av, who, amt);
      li.addEventListener("click", () => void detail(e));
      ul.append(li);
    });
    fresh.clear();
  };

  const load = async () => {
    try {
      entries = mergeEntries(entries, await D.api.leaderboard(sort, 50), sort, 50);
    } catch {
      if (!entries.length) {
        ul.replaceChildren(el("li", "empty", "The Hall of Shame is closed for a public holiday. Try again later."));
        return;
      }
    }
    render();
  };

  const detail = async (e: LeaderboardEntry) => {
    const m = el("div", "sheet-modal");
    const b = el("div", "sheet-body");
    m.append(b);
    m.addEventListener("click", (ev) => ev.target === m && m.remove());
    b.append(el("h1", "", `${e.meltdown ? "🔥 " : ""}${e.startupName}`), el("p", "sub", [e.founderName, e.oneLiner].filter(Boolean).join(" — ") || "Founder unknown (fled)"));
    const totals = el("div", "v-totals");
    const t1 = el("div");
    t1.append(el("b", "", formatEurFull(e.totalEur)), el("small", "", "fines"));
    const t2 = el("div");
    t2.append(el("b", "", formatJail(e.totalJailMonths)), el("small", "", "jail"));
    totals.append(t1, t2);
    const chips = el("div", "chips");
    e.topLaws.forEach((l) => chips.append(el("span", "", l)));
    const findings = el("div", "v-list", "");
    findings.append(el("h3", "", "Findings"), el("p", "sub", "Loading the file…"));
    const close = el("button", "btn ghost big", "Close file");
    close.addEventListener("click", () => m.remove());
    b.append(totals, chips);
    if (e.meanwhile) b.append(meanwhileCard(e.meanwhile));
    b.append(findings, close);
    document.body.append(m);
    try {
      const d = await D.api.leaderboardEntry(e.caseId);
      const list = el("ul");
      d.findings.forEach((f) => {
        const li = el("li");
        li.append(el("b", "", `${f.provision.label}: `), document.createTextNode(f.text));
        list.append(li);
      });
      findings.replaceChildren(el("h3", "", "Findings"), d.findings.length ? list : el("p", "sub", "No findings. Suspicious."));
    } catch (err) {
      findings.replaceChildren(el("h3", "", "Findings"), el("p", "sub", errText(err)));
    }
  };

  return {
    open(): void {
      if (!built) {
        built = true;
        const h = el("div", "scr-head");
        const t = el("div");
        const live = el("small");
        live.append(el("span", "live"), document.createTextNode("Live · Directorate-General for Shame"));
        t.append(live, el("strong", "", "Hall of Shame"));
        h.append(el("div", "eu-flag"), t);
        (Object.keys(tb) as LeaderboardSort[]).forEach((k) => {
          tb[k].addEventListener("click", () => {
            sort = k;
            (Object.keys(tb) as LeaderboardSort[]).forEach((x) => tb[x].classList.toggle("on", x === k));
            entries = mergeEntries([], entries, sort, 50);
            render();
            void load();
          });
          tabs.append(tb[k]);
        });
        root.append(h, tabs, ul);
        shell.board.append(root);
        ul.append(el("li", "empty", "Fetching the shame…"));
      }
      void load();
      unsub ??= D.api.leaderboardStream((e) => {
        fresh.add(e.caseId);
        entries = mergeEntries(entries, [e], sort, 50);
        if (!shell.board.hidden) render();
      });
    },
  };
})();
