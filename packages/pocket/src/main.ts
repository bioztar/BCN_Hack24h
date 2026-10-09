import "./style.css";
import { LiveApi, MockApi, type Api } from "./api";
import { Sound, buzz, voiceFor, type Playback } from "./audio";
import { drawNotice, formatEur, toBlob } from "./card";
import { reactionLine, type Reaction } from "./lines";
import { ShakeDetector, Stillness, gravityFromOrientation, lowPass, toScreenFrame, type Vec3 } from "./motion";
import { initialState, reduce, type Action, type LineEvent, type RoastState } from "./reducer";
import { Stage } from "./scene";
import type { Pair, Persona, PersonaId, RoastEvent } from "./types";

const params = new URLSearchParams(location.search);
const api: Api = params.has("mock") && params.get("mock") !== "0" ? new MockApi() : new LiveApi();
const sound = new Sound();
const app = document.getElementById("app")!;
const POCKET_URL = "https://eurocrat.pro7ocol.com/pocket/";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

document.addEventListener("pointerdown", () => sound.unlock(), { capture: true });
document.addEventListener("touchend", () => sound.unlock(), { capture: true, passive: true });

let personas: Persona[] = [];
let pairs: Pair[] = [];
let me: Persona | null = null;

// ---------- Pick ----------

async function showPick(): Promise<void> {
  app.replaceChildren();
  const page = el("div", "pick");
  const head = el("header", "form-head");
  head.append(el("div", "eu-flag"), el("div", "form-head-text"));
  head.lastElementChild!.append(el("strong", "", "DG ROAST · Pocket Annex"), el("span", "", "Form P-1 — Allocation of a Case Officer"));
  page.append(head);
  page.append(el("p", "lede", "A tiny EU official will live in your phone. Choose one. They will refuse you regardless."));
  if (api.mock) page.append(el("p", "mock-badge", "MOCK MODE — fixture roast, no server"));
  const grid = el("div", "pick-grid");
  page.append(grid);
  const assign = el("button", "btn primary big", "Assign me one");
  page.append(assign, el("p", "fine-print", "Processing of your choice is lawful under a legitimate interest you were not consulted on."));
  app.append(page);

  [personas, pairs] = await Promise.all([api.personas(), api.pairs()]);
  const paired = new Set(pairs.flatMap((p) => p.officers));
  const roster = personas.filter((p) => paired.has(p.id));
  const shown = roster.length ? roster : personas.slice(0, 6);
  const thumbs = Stage.thumbnails(shown);
  for (const p of shown) {
    const card = el("button", "officer");
    card.style.setProperty("--accent", p.color);
    const img = el("div", "officer-img");
    const src = thumbs.get(p.id);
    if (src) img.style.backgroundImage = `url(${src})`;
    const pair = pairs.find((x) => x.officers.includes(p.id));
    card.append(img, el("strong", "", p.name), el("span", "officer-title", p.title));
    if (pair) card.append(el("span", "officer-pair", `Pair: ${pair.id}`));
    card.addEventListener("click", () => choose(p));
    grid.append(card);
  }
  assign.addEventListener("click", () => {
    const p = shown[Math.floor(Math.random() * shown.length)]!;
    assign.textContent = `Allocated: ${p.name}`;
    setTimeout(() => choose(p), 700);
  });
}

function choose(p: Persona): void {
  me = p;
  showPermit();
}

// ---------- Permission gag (Form M-50) ----------

type PermState = "granted" | "denied" | "unsupported";
async function requestMotion(): Promise<PermState> {
  const DME = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
  const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
  if (!DME && !DOE) return "unsupported";
  const calls = [DME?.requestPermission?.(), DOE?.requestPermission?.()].filter(Boolean) as Promise<string>[];
  if (!calls.length) return "granted";
  try {
    const res = await Promise.all(calls);
    return res.every((r) => r === "granted") ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

function showPermit(): void {
  const modal = el("div", "modal");
  const form = el("div", "paper-form");
  form.append(el("div", "form-no", "FORM M-50"), el("h2", "", "Request for access to motion data"));
  form.append(el("p", "", `Applicant requests that ${me!.name} be subjected to gravity, tilting and shaking, for the purposes of a pilot programme.`));
  const rows = el("div", "form-rows");
  rows.append(el("div", "", "Processing time: 6–8 weeks"), el("div", "", "Legal basis: Art. 6(1)(f), probably"), el("div", "", "Copies required: 3"));
  form.append(rows);
  const status = el("div", "form-status");
  const btn = el("button", "btn primary big", "Submit Form M-50");
  form.append(status, btn);
  modal.append(form);
  app.append(modal);
  btn.addEventListener("click", async () => {
    sound.unlock();
    const permP = requestMotion();
    btn.disabled = true;
    const weeks = ["Week 1: received", "Week 3: forwarded to Unit C.4", "Week 5: lost", "Week 6: found", "Week 8: decided"];
    for (const w of weeks) {
      status.textContent = w;
      sound.rustle();
      await new Promise((r) => setTimeout(r, 260));
    }
    const perm = await permP;
    const st = el("div", `form-stamp ${perm === "denied" ? "red" : "green"}`, perm === "denied" ? "REFUSÉ" : "APPROUVÉ");
    form.append(st);
    perm === "denied" ? sound.stamp() : sound.approve();
    status.textContent = perm === "denied" ? "Motion access refused. Fallback controls granted instead." : "Approved. Exceptionally fast. Do not get used to it.";
    await new Promise((r) => setTimeout(r, 900));
    modal.remove();
    enterBox(perm === "granted");
  });
}

// ---------- The box ----------

let stage: Stage | null = null;
let state: RoastState = initialState;
let streamAbort: AbortController | null = null;
const queue: LineEvent[] = [];
let played = 0;
let speaking: { id: PersonaId; pb: Playback } | null = null;
let playing = false;

const hud = {
  root: el("div", "box"),
  stageHost: el("div", "stage-host"),
  top: el("div", "hud-top"),
  name: el("div", "hud-name"),
  ticket: el("div", "hud-ticket"),
  tiers: el("div", "tiers"),
  sub: el("div", "subtitle"),
  bottom: el("div", "hud-bottom"),
  pitch: el("button", "btn primary pitch-btn", "Pitch him"),
  shake: el("button", "btn ghost", "Shake"),
  back: el("button", "icon-btn", "‹"),
  mute: el("button", "icon-btn", "🔊"),
  hint: el("div", "hint"),
  banner: el("div", "tier-banner"),
  ink: el("div", "ink-layer"),
};

function say(personaId: PersonaId, text: string, provisions: LineEvent["provisions"] = [], ttlMs = 3200): void {
  const p = personaById(personaId);
  hud.sub.replaceChildren();
  hud.sub.classList.add("show");
  const who = el("div", "sub-who", p?.name ?? personaId);
  who.style.color = p?.color ?? "#ffcc00";
  hud.sub.append(who, el("div", "sub-text", text));
  if (provisions.length) {
    const chips = el("div", "chips");
    for (const pr of provisions) {
      const a = el("a", "chip", pr.label);
      a.href = pr.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.title = pr.title;
      chips.append(a);
    }
    hud.sub.append(chips);
  }
  clearTimeout(subTimer);
  if (ttlMs > 0) subTimer = window.setTimeout(() => hud.sub.classList.remove("show"), ttlMs);
}
let subTimer = 0;

function personaById(id: PersonaId): Persona | undefined {
  return state.officers?.find((p) => p.id === id) ?? personas.find((p) => p.id === id);
}

let lastReaction = 0;
function react(kind: Reaction, force = false): void {
  if (!me || (playing && !force)) return;
  const now = performance.now();
  if (!force && now - lastReaction < 2200) return;
  lastReaction = now;
  say(me.id, reactionLine(me.id, kind), [], 2600);
}

function inkSplat(text: string): void {
  const s = el("div", "ink");
  const rot = -18 + Math.random() * 20;
  s.style.setProperty("--rot", `${rot}deg`);
  s.style.left = `${10 + Math.random() * 20}%`;
  s.style.top = `${25 + Math.random() * 30}%`;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "-100 -100 200 200");
  svg.classList.add("splat");
  const path = document.createElementNS(svgNS, "path");
  let d = "";
  const n = 22;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 55 + Math.random() * 30 + (i % 5 === 0 ? 25 : 0);
    d += `${i ? "L" : "M"}${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r * 0.6).toFixed(1)}`;
  }
  path.setAttribute("d", d + "Z");
  svg.append(path);
  for (let i = 0; i < 7; i++) {
    const c = document.createElementNS(svgNS, "circle");
    const a = Math.random() * Math.PI * 2;
    c.setAttribute("cx", String(Math.cos(a) * (85 + Math.random() * 15)));
    c.setAttribute("cy", String(Math.sin(a) * (60 + Math.random() * 25)));
    c.setAttribute("r", String(3 + Math.random() * 7));
    svg.append(c);
  }
  s.append(svg, el("div", "ink-text", text));
  hud.ink.append(s);
  setTimeout(() => s.classList.add("dry"), 2200);
  while (hud.ink.children.length > 5) hud.ink.firstElementChild!.remove();
}

function stampScreen(text: "REFUSÉ" | "INCOMPLET" | "RENVOYÉ EN COMMISSION" = "REFUSÉ", who: PersonaId | null = me?.id ?? null): void {
  inkSplat(text);
  sound.stamp();
  buzz([30, 40, 90]);
  if (who) stage?.actors.get(who)?.rig.stamp();
  document.body.classList.remove("jolt");
  void document.body.offsetWidth;
  document.body.classList.add("jolt");
}

function renderTiers(): void {
  hud.tiers.replaceChildren();
  for (let i = 1; i <= 5; i++) hud.tiers.append(el("span", state.tier && i <= state.tier ? "on" : ""));
}

function enterBox(motionGranted: boolean): void {
  app.replaceChildren();
  const h = hud;
  h.root.replaceChildren(h.stageHost, h.ink, h.top, h.banner, h.sub, h.hint, h.bottom);
  h.top.replaceChildren(h.back, h.name, h.ticket, h.mute);
  h.name.replaceChildren(el("strong", "", me!.name), el("span", "", me!.title));
  h.name.style.setProperty("--accent", me!.color);
  h.ticket.replaceChildren(h.tiers);
  renderTiers();
  h.bottom.replaceChildren(h.shake, h.pitch);
  h.pitch.textContent = me!.id === "annexe" || me!.id === "grandma-gdpr" ? "Pitch her" : me!.id === "auditor-9000" || me!.id === "the-cookie" ? "Pitch it" : "Pitch him";
  app.append(h.root);
  if (!stage) {
    stage = new Stage(h.stageHost);
    window.addEventListener("resize", () => stage?.resize());
    startLoop();
    bindInput();
  } else {
    for (const id of [...stage.actors.keys()]) stage.removeActor(id);
    stage.resize();
  }
  stage.addActor(me!);
  resetCase();
  motion.granted = motionGranted;
  setHint();
  setTimeout(() => react("hello", true), 500);
}

function setHint(): void {
  hud.hint.textContent = motion.live ? "Tilt the phone. Shake to get stamped." : "No motion sensor: drag to tilt · arrow keys · S or the Shake button";
  hud.hint.classList.toggle("show", true);
  setTimeout(() => hud.hint.classList.remove("show"), 5000);
}

// ---------- Motion ----------

const motion = {
  granted: false,
  live: false,
  raw: { x: 0, y: -1, z: 0 } as Vec3,
  g: { x: 0, y: -1, z: 0 } as Vec3,
  virtual: { beta: 90, gamma: 0 },
  drag: null as { x: number; y: number; sx: number; sy: number; moved: boolean } | null,
  keys: new Set<string>(),
  active: false,
};
const shaker = new ShakeDetector();
const still = new Stillness(20);

window.addEventListener("deviceorientation", (e) => {
  if (e.beta === null || e.gamma === null) return;
  if (!motion.live) {
    motion.live = true;
    if (stage) setHint();
  }
  const angle = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
  motion.raw = toScreenFrame(gravityFromOrientation(e.beta, e.gamma), angle);
});

window.addEventListener("devicemotion", (e) => {
  const a = e.acceleration;
  let x = a?.x ?? null;
  let y = a?.y ?? null;
  let z = a?.z ?? null;
  if (x === null || y === null || z === null) {
    const ag = e.accelerationIncludingGravity;
    if (!ag || ag.x === null || ag.y === null || ag.z === null) return;
    const mag = Math.hypot(ag.x, ag.y, ag.z);
    x = mag - 9.81;
    y = 0;
    z = 0;
  }
  if (Math.hypot(x, y, z) > 3) motion.active = true;
  if (shaker.sample(x, y, z, performance.now())) doShake();
});

function doShake(): void {
  if (!stage || !me) return;
  stage.physics.shake(1.6);
  still.poke();
  stampScreen("REFUSÉ");
  react("shake", true);
  sound.rustle();
}

function fallbackGravity(): Vec3 {
  const v = motion.virtual;
  if (motion.drag) {
    const dx = motion.drag.x - motion.drag.sx;
    const dy = motion.drag.y - motion.drag.sy;
    const k = 1 / 90;
    const gx = Math.max(-1.6, Math.min(1.6, dx * k));
    const gy = -1 + Math.max(-2, Math.min(2, dy * k));
    const n = Math.hypot(gx, gy) || 1;
    return { x: gx / n, y: gy / n, z: -0.15 };
  }
  return gravityFromOrientation(v.beta, v.gamma);
}

function bindInput(): void {
  const canvas = stage!.renderer.domElement;
  canvas.addEventListener("pointerdown", (e) => {
    motion.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!motion.drag) return;
    motion.drag.x = e.clientX;
    motion.drag.y = e.clientY;
    if (Math.hypot(e.clientX - motion.drag.sx, e.clientY - motion.drag.sy) > 12) motion.drag.moved = true;
    motion.active = true;
  });
  const end = (e: PointerEvent) => {
    const d = motion.drag;
    motion.drag = null;
    if (!d || d.moved || !stage) return;
    const id = stage.pick(e.clientX, e.clientY);
    if (id) {
      stage.physics.poke(id, { x: (Math.random() - 0.5) * 0.6, y: 0.9, z: 0 }, 1);
      sound.thud(2);
      still.poke();
      if (id === me?.id) react("poke", true);
    }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", () => (motion.drag = null));
  window.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement)?.closest?.("input,textarea")) return;
    if (e.key === "s" || e.key === "S") doShake();
    if (e.key.startsWith("Arrow")) {
      motion.keys.add(e.key);
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => motion.keys.delete(e.key));
  hud.shake.addEventListener("click", doShake);
  hud.pitch.addEventListener("click", () => {
    if (state.phase === "verdict") {
      if (!document.querySelector(".notice-modal")) void showNotice(true);
      return;
    }
    openSheet(state.phase === "awaiting" ? "reply" : "pitch");
  });
  hud.back.addEventListener("click", () => {
    streamAbort?.abort();
    stopSpeaking();
    void showPick();
  });
  hud.mute.addEventListener("click", () => {
    sound.muted = !sound.muted;
    hud.mute.textContent = sound.muted ? "🔇" : "🔊";
  });
}

let lyingFor = 0;
let stoodUpAt = 0;
let zTimer = 0;
let snoreTimer = 0;
let moodTimer = 0;

function startLoop(): void {
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    tick(dt, now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function tick(dt: number, now: number): void {
  if (!stage || !me) return;
  if (!motion.live) {
    const v = motion.virtual;
    const rate = 120 * dt;
    if (motion.keys.has("ArrowLeft")) v.gamma = Math.max(-85, v.gamma - rate);
    if (motion.keys.has("ArrowRight")) v.gamma = Math.min(85, v.gamma + rate);
    if (motion.keys.has("ArrowUp")) v.beta = Math.min(179, v.beta + rate);
    if (motion.keys.has("ArrowDown")) v.beta = Math.max(-10, v.beta - rate);
    if (!motion.keys.size && !motion.drag) {
      v.gamma *= 1 - Math.min(1, dt * 1.5);
      v.beta += (90 - v.beta) * Math.min(1, dt * 1.5);
    }
    if (motion.keys.size) motion.active = true;
    motion.raw = fallbackGravity();
  }
  const prev = motion.g;
  motion.g = lowPass(motion.g, motion.raw, Math.min(1, dt * 12));
  const dg = Math.hypot(motion.g.x - prev.x, motion.g.y - prev.y, motion.g.z - prev.z);
  stage.physics.setGravity(motion.g);
  const res = stage.step(dt);

  for (const b of res.bumps) {
    sound.thud(b.speed);
    if (b.figure !== me.id) continue;
    if (b.speed > 2.2) buzz(20);
    const rig = stage.actors.get(me.id)?.rig;
    if (rig && !still.asleep) {
      rig.mood("appalled");
      moodTimer = 0.9;
    }
    react(b.wall === "glass" ? "glass" : "bump");
  }
  if (moodTimer > 0 && (moodTimer -= dt) <= 0 && !still.asleep) stage.actors.get(me.id)?.rig.mood("neutral");

  const speed = stage.physics.speed(me.id);
  const busy = playing || state.phase === "streaming" || state.phase === "submitting" || sheetOpen;
  const active = motion.active || dg > 0.004 || speed > 0.25 || busy;
  motion.active = false;
  const ev = still.tick(dt, active);
  const rig = stage.actors.get(me.id)?.rig;
  if (ev === "sleep") {
    rig?.mood("asleep");
    react("sleep", true);
    sound.snore();
  } else if (ev === "wake") {
    rig?.mood("neutral");
    react("wake", true);
  }
  if (still.asleep) {
    if ((zTimer -= dt) <= 0) {
      stage.sleepZ(me.id);
      zTimer = 1.1;
    }
    if ((snoreTimer -= dt) <= 0) {
      sound.snore();
      snoreTimer = 3.2;
    }
  }

  const flat = Math.abs(motion.g.z) > 0.75;
  if (!flat && stage.physics.uprightness(me.id) < 0.35 && speed < 0.2 && !still.asleep) {
    lyingFor += dt;
    if (lyingFor > 2.2 && lyingFor - dt <= 2.2) react(stage.physics.faceDownness(me.id) > 0.5 ? "faceDown" : "bump", true);
    if (lyingFor > 4 && now - stoodUpAt > 3000) {
      stage.physics.standUp(me.id, 1.4);
      stoodUpAt = now;
      lyingFor = 0;
      setTimeout(() => react("getUp", true), 600);
    }
  } else lyingFor = 0;

  for (const a of stage.actors.values()) {
    if (speaking && a.persona.id === speaking.id) a.rig.talk(speaking.pb.level());
    else a.rig.talk(0);
  }
}

// ---------- Pitch sheet + dictation ----------

let sheetOpen = false;

function openSheet(mode: "pitch" | "reply"): void {
  if (sheetOpen) return;
  sheetOpen = true;
  const modal = el("div", "modal sheet-modal");
  const sheet = el("form", "sheet");
  sheet.append(el("div", "form-no", mode === "pitch" ? "FORM S-1 · Submission of a Startup" : "FORM A-2 · Notice of Appeal"));
  sheet.append(el("h2", "", mode === "pitch" ? "Pitch your startup" : state.prompt ?? "Argue back"));
  const ta = el("textarea");
  ta.placeholder = mode === "pitch" ? "We're building Uber for… (or hold the microphone)" : "But it's actually compliant because…";
  ta.rows = 4;
  ta.maxLength = 1200;
  const rev = el("input");
  rev.type = "number";
  rev.inputMode = "numeric";
  rev.min = "0";
  rev.placeholder = "Annual turnover in € (optional, used against you)";
  const mic = el("button", "btn mic", "Hold to dictate");
  mic.type = "button";
  const status = el("div", "sheet-status");
  const row = el("div", "sheet-row");
  const cancel = el("button", "btn ghost", "Withdraw");
  cancel.type = "button";
  const submit = el("button", "btn primary", mode === "pitch" ? "Submit in triplicate" : "File appeal");
  submit.type = "submit";
  row.append(cancel, submit);
  sheet.append(ta);
  if (mode === "pitch") sheet.append(rev);
  sheet.append(mic, status, row);
  modal.append(sheet);
  app.append(modal);
  setTimeout(() => ta.focus(), 50);
  let dictated = false;
  const close = () => {
    sheetOpen = false;
    modal.remove();
  };
  cancel.addEventListener("click", close);
  bindDictation(mic, status, (text) => {
    ta.value = ta.value ? `${ta.value} ${text}` : text;
    dictated = true;
  });
  sheet.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) {
      status.textContent = "Form incomplete. Field 1 is mandatory. Everything is mandatory.";
      return;
    }
    close();
    if (mode === "pitch") void startCase(text, dictated, rev.value ? Number(rev.value) : undefined);
    else void sendReply(text);
  });
}

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]) if (MediaRecorder.isTypeSupported?.(m)) return m;
  return undefined;
}

function bindDictation(btn: HTMLButtonElement, status: HTMLElement, onText: (t: string) => void): void {
  let rec: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let held = false;
  const transcribe = async (blob: Blob) => {
    status.textContent = "Transcribing… (translating into 24 languages, keeping one)";
    try {
      const text = await api.stt(blob);
      if (text) onText(text);
      status.textContent = text ? "Transcribed. Please check it; we won't." : "Nothing heard. Silence is not a pitch.";
    } catch (err) {
      status.textContent = `${err instanceof Error ? err.message : "STT failed"} — please type instead.`;
    }
  };
  btn.addEventListener("pointerdown", async (e) => {
    e.preventDefault();
    held = true;
    btn.classList.add("rec");
    btn.textContent = "Recording… release to file";
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!held) {
        stream.getTracks().forEach((t) => t.stop());
        status.textContent = "Microphone approved. Now hold the button while you speak.";
        return;
      }
      const mime = pickMime();
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks = [];
      rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      rec.onstop = () => {
        stream?.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec?.mimeType || mime || "audio/webm" });
        if (blob.size > 0) void transcribe(blob);
        else if (api.mock) void transcribe(blob);
      };
      rec.start();
    } catch {
      if (api.mock) {
        status.textContent = "No microphone. Mock dictation filed on your behalf.";
        if (!held) void transcribe(new Blob([], { type: "audio/webm" }));
      } else status.textContent = "Microphone access REFUSÉ. Please type.";
    }
  });
  const release = () => {
    if (!held) return;
    held = false;
    btn.classList.remove("rec");
    btn.textContent = "Hold to dictate";
    if (rec && rec.state === "recording") rec.stop();
    else if (api.mock && !rec) void transcribe(new Blob([], { type: "audio/webm" }));
    rec = null;
  };
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointerleave", release);
  btn.addEventListener("pointercancel", release);
}

// ---------- Case + roast player ----------

function dispatch(a: Action): void {
  const prev = state;
  state = reduce(state, a);
  if (state.tier !== prev.tier && state.tier) onTier(state.tier, state.tierName ?? "");
  if (state.officers !== prev.officers && state.officers) onOfficers(state.officers);
  if (state.lines.length > prev.lines.length) {
    queue.push(...state.lines.slice(prev.lines.length));
    void pump();
  }
  if (state.ticket !== prev.ticket && state.ticket) stage?.setTicket(state.ticket);
  updateControls();
}

function resetCase(): void {
  streamAbort?.abort();
  stopSpeaking();
  queue.length = 0;
  played = 0;
  state = initialState;
  for (const id of [...(stage?.actors.keys() ?? [])]) if (id !== me?.id) stage?.removeActor(id);
  renderTiers();
  updateControls();
}

function officersFor(id: PersonaId): [PersonaId, PersonaId] {
  const pair = pairs.find((p) => p.officers.includes(id));
  if (pair) return pair.officers;
  const other = personas.find((p) => p.id !== id);
  return [id, other?.id ?? id];
}

async function startCase(text: string, dictated: boolean, revenueEur?: number): Promise<void> {
  if (!me) return;
  resetCase();
  dispatch({ type: "submit" });
  say(me.id, "Submission received. Please take a number.", [], 0);
  sound.ding();
  try {
    const c = await api.createCase({ kind: dictated ? "dictation" : "text", text, ...(revenueEur !== undefined && Number.isFinite(revenueEur) ? { revenueEur } : {}) }, officersFor(me.id));
    dispatch({ type: "case", caseId: c.caseId, ticket: c.ticket });
    await openStream(c.caseId);
  } catch (err) {
    dispatch({ type: "failed", message: err instanceof Error ? err.message : String(err) });
  }
}

async function sendReply(text: string): Promise<void> {
  if (!state.caseId) return;
  try {
    await api.reply(state.caseId, text);
    dispatch({ type: "round" });
    await openStream(state.caseId);
  } catch (err) {
    dispatch({ type: "failed", message: err instanceof Error ? err.message : String(err) });
  }
}

async function openStream(caseId: string): Promise<void> {
  streamAbort?.abort();
  const ctl = new AbortController();
  streamAbort = ctl;
  try {
    await api.stream(caseId, (e: RoastEvent) => dispatch(e), ctl.signal);
    if (!ctl.signal.aborted) dispatch({ type: "closed" });
  } catch (err) {
    if (!ctl.signal.aborted) dispatch({ type: "failed", message: err instanceof Error ? err.message : String(err) });
  }
}

function onOfficers(officers: Persona[]): void {
  if (!stage || !me) return;
  for (const p of officers) {
    if (p.id === me.id) continue;
    if (!stage.actors.has(p.id)) {
      stage.addActor(p, true);
      sound.ding();
    }
  }
}

function onTier(tier: number, name: string): void {
  renderTiers();
  hud.banner.replaceChildren(el("small", "", `TIER ${tier} / 5`), el("strong", "", name.toUpperCase()));
  hud.banner.classList.remove("show");
  void hud.banner.offsetWidth;
  hud.banner.classList.add("show");
  if (tier === 3) sound.council();
  else sound.ding();
}

function stopSpeaking(): void {
  speaking?.pb.stop();
  speaking = null;
}

async function pump(): Promise<void> {
  if (playing) return;
  playing = true;
  try {
    while (played < queue.length) {
      const line = queue[played++]!;
      say(line.speaker, line.text, line.provisions, 0);
      if (line.stamp) stampScreen(line.stamp, line.speaker);
      let pb: Playback;
      try {
        pb = line.audioUrl && sound.ready ? await sound.play(line.audioUrl) : sound.mumble(line.text, voiceFor(line.speaker));
      } catch {
        pb = sound.mumble(line.text, voiceFor(line.speaker));
      }
      speaking = { id: line.speaker, pb };
      const minRead = new Promise((r) => setTimeout(r, Math.min(7000, 900 + line.text.length * 38)));
      await Promise.all([pb.done, minRead]);
      if (speaking?.pb === pb) speaking = null;
      await new Promise((r) => setTimeout(r, 350));
    }
  } finally {
    playing = false;
    updateControls();
  }
}

function updateControls(): void {
  const s = state;
  const b = hud.pitch;
  b.disabled = false;
  b.classList.remove("pulse");
  if (s.phase === "submitting" || s.phase === "streaming" || playing) {
    b.textContent = "In procedure…";
    b.disabled = true;
  } else if (s.phase === "awaiting") {
    b.textContent = "Argue back";
    b.classList.add("pulse");
    if (s.prompt && me) say(s.officers?.[0]?.id ?? me.id, s.prompt, [], 0);
  } else if (s.phase === "verdict" && s.notice) {
    b.textContent = "View your Notice";
    void showNotice();
  } else if (s.phase === "error") {
    b.textContent = "Pitch again";
    if (me) say(me.id, `Procedural error: ${s.error ?? "unknown"}. Your file has been lost.`, [], 0);
  } else if (me) {
    b.textContent = me.id === "annexe" || me.id === "grandma-gdpr" ? "Pitch her" : me.id === "auditor-9000" || me.id === "the-cookie" ? "Pitch it" : "Pitch him";
  }
}

// ---------- Notice of Non-Compliance ----------

let noticeShownFor: string | null = null;

async function showNotice(force = false): Promise<void> {
  const n = state.notice;
  if (!n || (!force && noticeShownFor === n.serial)) return;
  noticeShownFor = n.serial;
  await new Promise((r) => setTimeout(r, 800));
  const officers = n.officers.map((id) => personaById(id)).filter((p): p is Persona => !!p);
  const canvas = drawNotice(n, officers, POCKET_URL);
  const blob = await toBlob(canvas);
  const file = new File([blob], `notice-${n.serial.replace(/\W+/g, "-")}.png`, { type: "image/png" });
  const url = URL.createObjectURL(blob);
  const modal = el("div", "modal notice-modal");
  const card = el("div", "notice-card");
  const img = el("img");
  img.src = url;
  img.alt = `Notice of Non-Compliance ${n.serial}: fine ${formatEur(n.fineEur)}`;
  const row = el("div", "sheet-row");
  const share = el("button", "btn primary", "Share notice");
  const save = el("a", "btn ghost", "Save PNG");
  save.href = url;
  save.download = file.name;
  const again = el("button", "btn ghost", "New case");
  row.append(again, save, share);
  card.append(img, row);
  modal.append(card);
  app.append(modal);
  sound.stamp();
  buzz([60, 40, 60]);
  share.addEventListener("click", async () => {
    const data: ShareData = { files: [file], title: "Notice of Non-Compliance", text: `My startup was refused by DG ROAST. Fine: ${formatEur(n.fineEur)}. Get your own official:`, url: POCKET_URL };
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share(data);
      else if (navigator.share) await navigator.share({ title: data.title, text: data.text, url: data.url });
      else save.click();
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") save.click();
    }
  });
  again.addEventListener("click", () => {
    modal.remove();
    noticeShownFor = null;
    URL.revokeObjectURL(url);
    resetCase();
    if (me) react("hello", true);
  });
}

void showPick();
