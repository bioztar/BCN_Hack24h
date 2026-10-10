import type { Api } from "../api";
import type { Case, ClipSlot, Persona, RepoIntake, RoastEvent, Submission } from "../contract";
import { TIER_NAMES } from "../contract";
import { h, safeUrl, sleep } from "../dom";
import { SPEAK, withFlags } from "../env";
import { mockBroadcastLine } from "../mock";
import { initialState, reduce, type LineEvent, type StageAction, type StageState } from "../reducer";
import { Sequencer, makeLinePlayer, LateAudio } from "../sequencer";
import { OfficialView } from "../stage/official";
import { analyse, chime, council, speak, thud, unlockAudio } from "../stage/sfx";
import { slam } from "../stage/stamp3d";
import { chrome } from "./chrome";
import { noticeView } from "./notice";
import { holdToRecord } from "./recorder";

/** Loudness of the line currently playing (null → puppet fakes the flap). */
let level: (() => number) | null = null;
const currentLevel = () => (level ? level() : null);

/** The server sends a line with audioUrl:null after ~2.5 s of TTS; a round's first line (cold TTS) needs longer. */
const FIRST_LINE_AUDIO_MS = 9000;
const LATE_AUDIO_MS = 3000;

/** Autoplay refused (e.g. reload mid-hearing): one tap replays the line; gives up after 20 s. */
function tapToHear(): Promise<boolean> {
  return new Promise((resolve) => {
    const btn = h("button", { class: "btn primary tap-to-hear", type: "button" }, "🔊 Tap to hear the Commission");
    const done = (ok: boolean) => {
      clearTimeout(timer);
      btn.remove();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), 20_000);
    btn.addEventListener("click", () => (unlockAudio(), done(true)), { once: true });
    document.body.append(btn);
  });
}

const playLine = makeLinePlayer({
  createAudio: (url) => {
    const audio = new Audio(url);
    level = analyse(audio);
    return audio;
  },
  sleep,
  speak: SPEAK ? speak : undefined,
  unblock: tapToHear,
});

function chips(line: LineEvent): HTMLElement | null {
  if (!line.provisions.length) return null;
  return h(
    "span",
    { class: "chips" },
    line.provisions.map((p) => {
      const url = safeUrl(p.url);
      return url ? h("a", { class: "chip", href: url, target: "_blank", rel: "noopener noreferrer", title: p.title }, p.label) : null;
    }),
  );
}

function inkSplat(host: HTMLElement, text: string): void {
  const splat = h("div", { class: "ink", style: `left:${30 + Math.random() * 40}%;top:${25 + Math.random() * 40}%;--r:${Math.round(Math.random() * 30 - 15)}deg` }, h("span", null, text));
  host.append(splat);
  setTimeout(() => splat.classList.add("dry"), 2400);
  setTimeout(() => splat.remove(), 9000);
}

export function hearing(root: HTMLElement, api: Api, kase: Case, officers: [Persona, Persona], pair: string, sub: Submission): void {
  let state: StageState = initialState(officers);
  let views: OfficialView[] = [];
  const late = new LateAudio();
  let stampedThisRound = false;
  let firstOfRound = true;
  for (const ev of ["pointerdown", "keydown"] as const) document.addEventListener(ev, unlockAudio, { passive: true });

  const tierBanner = h("div", { class: "tier-banner" });
  const ladder = h("ol", { class: "ladder" }, TIER_NAMES.map((n, i) => h("li", { dataset: { t: String(i + 1) } }, n)));
  const officials = h("div", { class: "officials" });
  const watermark = h("div", { class: "watermark", "aria-hidden": "true" });
  const inkLayer = h("div", { class: "ink-layer", "aria-hidden": "true" });
  const subtitle = h("div", { class: "subtitle", "aria-live": "polite" });
  const intake = h("aside", { class: "intake", hidden: true });
  const minutes = h("ol", { class: "minutes-list" });
  const controls = h("div", { class: "controls" });
  const room = h("div", { class: "room" }, h("div", { class: "backdrop", "aria-hidden": "true" }, h("div", { class: "window" }), h("div", { class: "flag" }), h("div", { class: "cabinet" }), h("div", { class: "plant" })), officials, watermark, inkLayer, intake);
  const stage = h(
    "div",
    { class: "hearing" },
    h("div", { class: "hearing-top" }, tierBanner, h("span", { class: "case-ref" }, `File ${kase.caseId.slice(0, 12)} · Ticket ${kase.ticket} · ${pair}`)),
    ladder,
    h("div", { class: "hearing-body" }, h("div", { class: "stage-col" }, room, controls), h("section", { class: "minutes" }, h("h3", null, "Minutes of the hearing"), minutes)),
  );
  room.after(subtitle);

  root.replaceChildren(chrome(stage, `H(2026) ${kase.ticket} final`));

  function mountOfficials(ps: [Persona, Persona]) {
    views.forEach((v) => v.dispose());
    views = ps.map((p) => new OfficialView(p));
    officials.replaceChildren(...views.map((v) => v.el));
  }
  mountOfficials(officers);

  function slotFor(p: Persona): ClipSlot {
    const c = state.clip;
    if (state.speaker === p.id) return c;
    if (state.speaker) return c === "repo-horror" ? c : "listening";
    if (state.phase === "awaiting") return Math.random() < 0.02 ? "asleep" : "listening";
    return c === "stamp" || c === "talking" ? "idle" : c;
  }

  function render() {
    for (const v of views) v.update(slotFor(v.persona), state.speaker === v.persona.id, currentLevel);
    tierBanner.textContent = `Tier ${state.tier} — ${state.tierName}`;
    stage.style.setProperty("--tier", String(state.tier));
    stage.dataset.tier = String(state.tier);
    ladder.querySelectorAll("li").forEach((li) => li.classList.toggle("done", Number(li.dataset.t) <= state.tier));
    const rows = state.tier * state.tier + 2;
    if (watermark.childElementCount !== rows) watermark.replaceChildren(...Array.from({ length: rows }, () => h("span", null, "AI-GENERATED CONTENT — Art. 50")));
  }

  function dispatch(a: StageAction) {
    const prev = state.officers;
    state = reduce(state, a);
    if (state.officers && state.officers !== prev && state.officers.map((p) => p.id).join() !== views.map((v) => v.persona.id).join()) mountOfficials(state.officers);
    render();
  }

  function who(id: string): Persona | undefined {
    return state.officers?.find((p) => p.id === id);
  }

  function addMinute(speaker: string, text: string, color: string, extra?: HTMLElement | null, cls = "") {
    const li = h("li", { class: cls, style: `--accent:${color}` }, h("b", null, speaker), " ", h("span", null, text), extra ?? null);
    minutes.append(li);
    li.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  async function showIntake(repo: RepoIntake) {
    const list = h("ul", { class: "intake-findings" });
    intake.replaceChildren(
      h("div", { class: "intake-head" }, "DOSSIER — INTAKE", h("small", null, "Form RI-7")),
      h("h4", null, repo.repo),
      h("p", { class: "intake-desc" }, repo.description || "No description. Suspicious."),
      h("p", { class: "intake-meta" }, `★ ${repo.stars} · ${repo.language ?? "language undeclared"}`),
      list,
      h("p", { class: "intake-sum" }, repo.summary),
    );
    intake.hidden = false;
    requestAnimationFrame(() => intake.classList.add("in"));
    await sleep(700);
    for (const f of repo.findings) {
      list.append(h("li", { class: "stamped" }, h("b", null, f.key), " ", f.detail));
      thud();
      await sleep(650);
    }
    await sleep(800);
    intake.classList.add("docked");
  }

  async function showTier(tier: number, name: string) {
    if (tier === 3) council();
    else chime();
    const flash = h(
      "div",
      { class: "tier-flash" },
      h("small", null, `Escalated to tier ${tier}`),
      h("strong", null, name),
      tier === 3 ? h("small", null, "The Council of the European Union has entered the room.") : null,
    );
    room.append(flash);
    await sleep(1600);
    flash.remove();
  }

  function impact(text: string) {
    thud();
    views.forEach((v) => v.startle());
    document.body.classList.remove("shake");
    void document.body.offsetWidth;
    document.body.classList.add("shake");
    inkSplat(inkLayer, text);
  }

  async function handle(e: RoastEvent, isCurrent: () => boolean) {
    switch (e.type) {
      case "line": {
        dispatch(e);
        const p = who(e.speaker);
        const line = state.current;
        if (!line || line.id !== e.id) return;
        subtitle.style.setProperty("--accent", p?.color ?? "#ffd617");
        subtitle.replaceChildren(h("b", { class: "sub-name" }, `${p?.name ?? e.speaker}:`), " ", e.text, chips(line) ?? "");
        subtitle.classList.add("on");
        addMinute(p?.name ?? e.speaker, e.text, p?.color ?? "#003399", chips(line));
        if (api.mock) mockBroadcastLine({ speaker: e.speaker, text: e.text, at: new Date().toISOString() });
        const stamp = e.stamp;
        if (stamp) stampedThisRound = true;
        level = null;
        const wait = firstOfRound ? FIRST_LINE_AUDIO_MS : LATE_AUDIO_MS;
        firstOfRound = false;
        const audioUrl = e.audioUrl ?? (api.mock ? null : await late.wait(e.id, wait, sleep));
        await Promise.all([playLine({ ...e, audioUrl }), stamp ? sleep(500).then(() => slam(stamp, () => impact(stamp))) : null]);
        if (isCurrent()) dispatch({ type: "line-end", id: e.id });
        await sleep(350);
        return;
      }
      case "tier": {
        const before = state.tier;
        dispatch(e);
        if (state.tier > before || state.lines.length === 0) await showTier(state.tier, state.tierName);
        return;
      }
      case "intake":
        dispatch(e);
        await showIntake(e.repo);
        return;
      default:
        dispatch(e);
    }
  }

  const queue = new Sequencer<RoastEvent>(handle);

  function showReply() {
    const text = h("textarea", { rows: 2, maxlength: 600, placeholder: "Argue back. It will be held against you (and raise the tier).", "aria-label": "Your reply" });
    const status = h("p", { class: "field-msg", role: "status" });
    const send = h("button", { class: "btn primary", type: "button" }, "Lodge objection ▸");
    const rec = holdToRecord({
      api,
      label: "Hold to argue",
      onText: (t) => (text.value = t),
      onStatus: (s, k) => {
        status.textContent = s;
        status.classList.toggle("bad", k === "error");
      },
    });
    const go = async () => {
      const reply = text.value.trim();
      if (reply.length < 2) {
        status.textContent = "An objection must contain at least one argument. Or two letters.";
        status.classList.add("bad");
        return;
      }
      send.disabled = true;
      status.textContent = "Objection registered. Escalating…";
      try {
        await api.reply(kase.caseId, reply);
      } catch (err) {
        send.disabled = false;
        status.textContent = `Objection refused: ${(err as Error).message}`;
        status.classList.add("bad");
        return;
      }
      addMinute("The applicant", reply, "#666", null, "applicant");
      dispatch({ type: "reply", text: reply });
      void round();
    };
    send.addEventListener("click", () => void go());
    text.addEventListener("keydown", (e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && void go());
    controls.replaceChildren(h("div", { class: "reply" }, h("p", { class: "prompt" }, state.awaiting ?? "Does the applicant wish to respond?"), text, h("div", { class: "reply-row" }, rec, send), status));
    text.focus();
  }

  function showVerdict() {
    const notice = state.notice;
    if (!notice) return;
    controls.replaceChildren(h("p", { class: "verdict-wait" }, "The notice is being printed…"));
    setTimeout(async () => {
      const view = noticeView(notice, state.officers ?? officers, sub.text);
      stage.append(view);
      view.scrollIntoView({ behavior: "smooth", block: "start" });
      await sleep(900);
      await slam("REFUSÉ", () => impact("REFUSÉ"));
      await slam("RENVOYÉ EN COMMISSION", () => impact("PUBLIÉ"));
      controls.replaceChildren(h("a", { class: "btn", href: withFlags("/wall/"), target: "_blank" }, "Open the Official Journal (wall) ↗"));
    }, 1200);
  }

  function showError() {
    const retry = h("button", { class: "btn primary", type: "button", onclick: () => void round() }, "Resubmit the request to be heard");
    controls.replaceChildren(h("div", { class: "error-box" }, h("p", null, `Procedural irregularity: ${state.error ?? "the hearing was interrupted"}`), retry, h("a", { class: "btn", href: withFlags("/?mock=1&skip=intro") }, "Use the rehearsal file (?mock=1)")));
  }

  async function round() {
    controls.replaceChildren(h("p", { class: "listening" }, h("span", { class: "dots" }), " The officials are deliberating. Please remain seated."));
    const ctl = new AbortController();
    let failure: string | null = null;
    try {
      stampedThisRound = false;
      firstOfRound = true;
      await api.stream(kase.caseId, (e) => (e.type === "audio" ? late.deliver(e.id, e.audioUrl) : queue.enqueue(e)), ctl.signal);
    } catch (err) {
      failure = (err as Error).message || "connection lost";
    }
    await queue.idle();
    if (state.phase === "awaiting") {
      if (!stampedThisRound) await slam("INCOMPLET", () => impact("INCOMPLET"));
      return showReply();
    }
    if (state.phase === "verdict") return showVerdict();
    if (state.phase !== "error") dispatch({ type: "connection-lost", message: failure ?? "the stream closed without a decision" });
    showError();
  }

  render();
  void sub;
  void round();
}

