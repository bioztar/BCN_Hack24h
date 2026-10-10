import { ratesFrom, talkMeanwhile } from "../live/meanwhile";
import { portraitCandidates, initials } from "../assets";
import type { BetterPlaceCause, LeaderboardEntry, Persona } from "../contract";
import { fmtInt, h, safeUrl } from "../dom";
import { POCKET_URL } from "../env";
import { compare, moves, tickerPick, top, type BoardSort } from "../live/board";
import { fmtEurShort, fmtJail, fmtJailShort, meltdownProgress, turnoverEstimate, turnoverLine } from "../live/fines";
import type { GameId, LiveApi } from "../live/api";
import { isV2Notice } from "../live/case";
import { OfficialView } from "../stage/official";
import { qrBox } from "../ui/qr";
import type { Change, Hub } from "./hub";
import { MeanwhileBoard, Roller } from "./widgets";
import { burningCandidates, causeTile, CAUSES, ensureHeatFilter, Fire, firstImage, paperStorm } from "./visuals";

export const GAME_URL = "https://eurocrat.pro7ocol.com/game/";
export type Dispose = () => void;

function bigQr(url: string, caption: string): HTMLElement {
  return h("div", { class: "big-qr" }, qrBox(url, caption, 900, "#000"), h("div", { class: "qr-url" }, url.replace(/^https:\/\//, "")));
}

/** Q — "Register your startup in the EU — join now". */
export function qrView(root: HTMLElement, hub: Hub): Dispose {
  const count = new Roller(fmtInt, "qr-count-num");
  const label = h("span", { class: "qr-count-label" });
  const mw = new MeanwhileBoard("day");
  const causes = Object.keys(CAUSES) as BetterPlaceCause[];
  root.replaceChildren(
    h(
      "div",
      { class: "pv pv-qr" },
      h(
        "div",
        { class: "qr-left" },
        h("div", { class: "kicker" }, "Eurocrat Commission · DG ROAST · Form EU-REG-1"),
        h("h1", { class: "qr-head" }, "Register your startup in the EU", h("br"), h("em", null, "— join now")),
        h("p", { class: "qr-sub" }, "Scan. Register. Be processed. Estimated decision: Q3 2031."),
        h("div", { class: "qr-count" }, count.el, label),
        h("div", { class: "qr-causes" }, h("small", null, "Fast-track available for startups that make the world a better place:"), h("div", { class: "tiles" }, causes.slice(0, 5).map(causeTile))),
      ),
      (() => {
        const qr = bigQr(POCKET_URL, "Scan to apply");
        qr.append(h("p", { class: "qr-price" }, "Free today. €49 after the hackathon. Accelerators: roast your whole cohort."));
        return qr;
      })(),
    ),
    mw.el,
  );
  const render = () => {
    const q = hub.queue;
    if (q !== null) {
      count.set(q);
      label.textContent = q === 1 ? "applicant in the queue" : "applicants in the queue";
    } else {
      count.set(hub.refusedToday);
      label.textContent = "startups refused today";
    }
    const { m, estimated } = hub.dayMeanwhile();
    mw.set(m, estimated);
  };
  render();
  const t = setInterval(render, 1000);
  const off = hub.on((c) => (c === "stats" || c === "board") && render());
  return () => (clearInterval(t), off());
}

function photo(e: LeaderboardEntry): HTMLElement {
  const url = safeUrl(e.photoUrl);
  const fallback = () => h("span", { class: "lb-initials" }, initials(e.founderName || e.startupName));
  return url ? firstImage([url], "lb-img", e.startupName, fallback) : fallback();
}

function row(e: LeaderboardEntry): HTMLElement {
  return h(
    "li",
    { class: `lb-row${e.meltdown ? " melted" : ""}`, dataset: { id: e.caseId } },
    h("span", { class: "lb-rank" }),
    h("span", { class: "lb-photo" }, photo(e)),
    h(
      "span",
      { class: "lb-who" },
      h("strong", null, e.startupName, e.meltdown ? h("span", { class: "lb-fire", title: "meltdown" }, " 🔥") : null),
      h("small", null, [e.founderName, e.topLaws.join(" · ")].filter(Boolean).join(" — ")),
    ),
    h("span", { class: "lb-eur" }, fmtEurShort(e.totalEur)),
    h("span", { class: "lb-jail" }, fmtJailShort(e.totalJailMonths)),
  );
}

/** L — top 10, toggle fines/jail (T), FLIP-animated reorder, ticker. */
export function boardView(root: HTMLElement, hub: Hub, state: { sort: BoardSort }): Dispose & { toggle(): void } {
  const list = h("ol", { class: "lb-list" });
  const tabs = h("div", { class: "lb-tabs" });
  const ticker = h("div", { class: "ticker-track" });
  const mw = new MeanwhileBoard("day");
  const empty = h("p", { class: "lb-empty" }, "No startup has been refused yet today. Give it a minute.");
  const title = h("h1", null, "Hall of Shame — most fined startups today");
  const hack = h("div", { class: "lb-hack" });
  const rows = new Map<string, HTMLElement>();
  let order: string[] = [];

  root.replaceChildren(
    h(
      "div",
      { class: "pv pv-board" },
      h("header", { class: "lb-head" }, title, tabs),
      hack,
      h("div", { class: "lb-cols" }, h("span", null, "#"), h("span", null, ""), h("span", null, "Startup"), h("span", null, "Fines"), h("span", null, "Jail")),
      list,
      empty,
      h("div", { class: "ticker" }, h("span", { class: "ticker-label" }, "OFFICIAL JOURNAL"), h("div", { class: "ticker-window" }, ticker)),
    ),
    mw.el,
  );

  const renderTabs = () =>
    tabs.replaceChildren(
      h("span", { class: `lb-tab${state.sort === "fines" ? " on" : ""}` }, "€ Fines"),
      h("span", { class: `lb-tab${state.sort === "jail" ? " on" : ""}` }, "⛓ Jail"),
      h("span", { class: `lb-tab${hub.event ? " on" : ""}` }, "🏁 This hackathon"),
      h("small", null, "T fines/jail · B hackathon"),
    );

  const renderHack = () => {
    hack.hidden = !hub.event;
    mw.el.hidden = !!hub.event; // the hackathon header takes the day board's room so all 10 rows fit
    title.textContent = hub.event ? "Hall of Shame — BCN Hack 24h" : "Hall of Shame — most fined startups today";
    if (!hub.event) return;
    const list = hub.boardEntries;
    const s = hub.eventStats;
    const refused = s?.refusedToday ?? list.length;
    const processed = Math.max(s?.applicantsToday ?? 0, refused);
    const eur = s?.totalEurToday ?? list.reduce((a, e) => a + e.totalEur, 0);
    const months = s?.totalJailMonthsToday ?? list.reduce((a, e) => a + e.totalJailMonths, 0);
    hack.textContent = `BCN Hack 24h — ${fmtInt(processed)} projects processed · ${fmtInt(refused)} refused · ${fmtEurShort(eur)} fines · ${fmtJail(months)}`;
  };

  const renderList = () => {
    const ranked = top(hub.boardEntries, state.sort, 10);
    empty.hidden = ranked.length > 0;
    const ids = ranked.map((e) => e.caseId);
    const before = new Map([...rows].map(([id, el]) => [id, el.getBoundingClientRect().top]));
    const moved = moves(order, ids);
    for (const [id, el] of rows) if (!ids.includes(id)) (el.remove(), rows.delete(id));
    ranked.forEach((e, i) => {
      let el = rows.get(e.caseId);
      const fresh = !el;
      const next = row(e);
      if (el) el.replaceChildren(...next.childNodes), (el.className = next.className);
      else (el = next), rows.set(e.caseId, el);
      el.querySelector(".lb-rank")!.textContent = String(i + 1);
      if (list.children[i] !== el) list.insertBefore(el, list.children[i] ?? null);
      if (fresh && hub.fresh.has(e.caseId)) (el.classList.add("arrive"), hub.fresh.delete(e.caseId));
      const dy = moved.get(e.caseId);
      if (dy) el.classList.add(dy > 0 ? "up" : "down");
    });
    // FLIP: from old position to new
    for (const [id, el] of rows) {
      const old = before.get(id);
      if (old === undefined) continue;
      const delta = old - el.getBoundingClientRect().top;
      if (!delta) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${delta}px)`;
      void el.offsetHeight;
      el.style.transition = "";
      el.style.transform = "";
    }
    setTimeout(() => rows.forEach((el) => el.classList.remove("up", "down")), 1600);
    order = ids;
  };

  let tickerKey = "";
  const renderTicker = (force = false) => {
    const picks = tickerPick(hub.captions, 12);
    const key = picks.map((c) => c.text).join("|");
    if (!force && (key === tickerKey || ticker.childElementCount)) return;
    tickerKey = key;
    const items = picks.length ? picks.map((c) => c.text) : ["Your application has been received. It will now be lost.", "Meanwhile, China shipped another model."];
    const strip = () => items.map((t) => h("span", { class: "tick" }, t));
    ticker.replaceChildren(...strip(), ...strip());
    ticker.style.setProperty("--dur", `${Math.max(30, items.join(" ").length / 9)}s`);
  };
  ticker.addEventListener("animationiteration", () => renderTicker(true));

  const renderMw = () => {
    const { m, estimated } = hub.dayMeanwhile();
    mw.set(m, estimated);
  };
  renderTabs();
  renderHack();
  renderList();
  renderTicker(true);
  renderMw();
  const t = setInterval(renderMw, 1000);
  const off = hub.on((c: Change) => {
    if (c === "board") (renderTabs(), renderHack(), renderList());
    if (c === "ticker") renderTicker();
    if (c === "stats") renderMw();
  });
  const dispose = (() => (clearInterval(t), off())) as Dispose & { toggle(): void };
  dispose.toggle = () => {
    state.sort = state.sort === "fines" ? "jail" : "fines";
    renderTabs();
    renderList();
  };
  return dispose;
}

/** Same comparator as the board, exported for the tests of the view's ordering. */
export const boardCompare = compare;

const GAMES: { id: GameId; name: string; emoji: string }[] = [
  { id: "whack", name: "Whack-a-Model", emoji: "🔨" },
  { id: "swipe", name: "Legal or Banned?", emoji: "👆" },
  { id: "flappy", name: "Regulatory Flappy", emoji: "🐦" },
  { id: "triplicate", name: "In Triplicate", emoji: "📄" },
];

/** A — Eurocrat Arcade: QR to /game/ + today's top score per game (missing routes skipped). */
export function arcadeView(root: HTMLElement, api: LiveApi): Dispose {
  const cards = h("div", { class: "arc-games" });
  root.replaceChildren(
    h(
      "div",
      { class: "pv pv-arcade" },
      h(
        "div",
        { class: "arc-left" },
        h("div", { class: "kicker" }, "Eurocrat Arcade · Form FUN-0 (fun is subject to authorisation)"),
        h("h1", { class: "qr-head" }, "Play while you wait", h("br"), h("em", null, "— the queue is long")),
        cards,
      ),
      bigQr(GAME_URL, "Scan to play"),
    ),
  );
  let alive = true;
  const load = async () => {
    const res = await Promise.all(GAMES.map((g) => api.gameTop(g.id).catch(() => "missing" as const)));
    if (!alive) return;
    cards.replaceChildren(
      ...GAMES.map((g, i) => {
        const r = res[i];
        const best = r && r !== "missing" ? h("span", { class: "arc-best" }, h("b", null, fmtInt(r.score)), h("small", null, r.name)) : h("span", { class: "arc-best none" }, r === "missing" ? "scores pending approval" : "no score yet today");
        return h("div", { class: "arc-game" }, h("span", { class: "arc-emoji" }, g.emoji), h("strong", null, g.name), best);
      }),
    );
  };
  void load();
  const t = setInterval(() => void load(), 10_000);
  return () => ((alive = false), clearInterval(t));
}

/** Officer on the live stage: the regular puppet, plus a burning overlay after meltdown. */
class LiveOfficer {
  readonly view: OfficialView;
  private burn: HTMLElement | null = null;
  private fire: Fire | null = null;
  constructor(readonly persona: Persona) {
    this.view = new OfficialView(persona);
  }
  setBurning(on: boolean) {
    if (on === !!this.burn) return;
    this.view.el.classList.toggle("burning", on);
    if (!on) {
      this.fire?.stop();
      this.burn?.remove();
      this.burn = this.fire = null;
      return;
    }
    ensureHeatFilter();
    this.fire = new Fire();
    const embers = new Fire("fire fire-front");
    embers.intensity = 0.35;
    this.burn = h("div", { class: "burn" }, this.fire.el, firstImage(burningCandidates(this.persona), "burn-img", `${this.persona.name}, on fire`), embers.el, h("i", { class: "burn-glow" }));
    this.view.el.querySelector(".frame")!.append(this.burn);
    this.fire.start();
    embers.start();
    const stop = this.fire.stop.bind(this.fire);
    this.fire.stop = () => (stop(), embers.stop());
  }
  dispose() {
    this.fire?.stop();
    this.view.dispose();
  }
}

function analyzingScreen(officers: Persona[]): { el: HTMLElement; set(stage: string, p: number): void; dispose(): void } {
  const exprs = ["appalled", "stamping", "asleep"] as const;
  const frames = officers.flatMap((o) => exprs.map((e) => ({ o, urls: portraitCandidates(o, e) })));
  const face = h("div", { class: "an-face" });
  const label = h("div", { class: "an-stage" });
  const bar = h("i");
  let k = 0;
  const cycle = () => {
    const f = frames[k++ % Math.max(1, frames.length)];
    face.replaceChildren(f ? firstImage(f.urls, "an-img", f.o.name, () => h("span", { class: "an-silhouette" }, "🗂️")) : h("span", { class: "an-silhouette" }, "🗂️"));
  };
  cycle();
  const t = setInterval(cycle, 850);
  const el = h(
    "div",
    { class: "analyzing" },
    paperStorm(26),
    h("div", { class: "an-title" }, "Repository under examination"),
    face,
    label,
    h("div", { class: "an-bar" }, bar),
    h("small", { class: "an-note" }, "Please do not leave the room. Please do not stay in the room either."),
  );
  return {
    el,
    set(stage, p) {
      label.textContent = stage || "Reading your README in all 24 official languages…";
      bar.style.width = `${Math.round(p * 100)}%`;
    },
    dispose: () => clearInterval(t),
  };
}

/** C — live case mirror. */
export function caseView(root: HTMLElement, hub: Hub): Dispose {
  const head = h("header", { class: "lc-head" });
  const officials = h("div", { class: "lc-officials" });
  const sub = h("div", { class: "lc-sub" });
  const overlay = h("div", { class: "lc-overlay" });
  const eur = new Roller(fmtEurShort, "lc-eur");
  const jail = new Roller(fmtJail, "lc-jail");
  const bar = h("i");
  const lastFine = h("div", { class: "lc-fine" });
  const meterEl = h("aside", { class: "lc-meter" }, h("div", { class: "lc-meter-title" }, "FINES METER"), eur.el, jail.el, h("div", { class: "lc-bar" }, bar, h("span", null, "MELTDOWN")), lastFine);
  const mw = new MeanwhileBoard("case");
  const room = h("div", { class: "lc-room" }, officials, overlay);
  const wrap = h("div", { class: "pv pv-case" }, head, h("div", { class: "lc-body" }, h("div", { class: "lc-stage" }, room, sub), meterEl));
  root.replaceChildren(wrap, mw.el);

  let views: LiveOfficer[] = [];
  let viewKey = "";
  let shownFine = "";
  let caseKey: string | null = "";
  let analyzing: ReturnType<typeof analyzingScreen> | null = null;

  const officersOf = (): Persona[] => {
    const s = hub.live;
    if (s.officers) return s.officers;
    const ids = s.notice?.officers ?? [];
    return ids.map((id) => hub.personas.find((p) => p.id === id)).filter((p): p is Persona => !!p);
  };

  const render = () => {
    const s = hub.live;
    if (s.caseId !== caseKey) {
      caseKey = s.caseId;
      shownFine = "";
      lastFine.replaceChildren();
      eur.set(0, true);
      jail.set(0, true);
    }
    const name = s.startupName ?? (s.notice ? s.notice.startup : null);
    head.replaceChildren(
      h("div", { class: "lc-title" }, h("span", { class: "kicker" }, s.ticket ? `File no. ${s.ticket}` : "Live hearing"), h("strong", null, name ?? "Unnamed applicant")),
      h("ol", { class: "lc-ladder" }, ["Pre-consultation", "Committee", "Trilogue", "Delegated Act", "Official Journal"].map((t, i) => h("li", { class: i < s.tier ? "done" : "" }, t))),
      h("div", { class: "lc-flags" }, hub.pinned ? h("span", { class: "flag-pin" }, "📌 pinned") : null, h("span", { class: "flag-sound" }, hub.sound ? "🔊 sound on (M)" : "🔇 sound off (M)")),
    );

    const ofs = officersOf();
    const key = ofs.map((o) => o.id).join("|");
    if (key !== viewKey) {
      views.forEach((v) => v.dispose());
      views = ofs.map((p) => new LiveOfficer(p));
      officials.replaceChildren(...views.map((v) => v.view.el));
      viewKey = key;
    }
    const line = s.line;
    for (const v of views) {
      const speaking = !!line && line.speaker === v.persona.id && hub.speaking;
      v.view.update(s.notice ? "verdict" : speaking ? (line!.clip ?? "talking") : s.awaiting ? "listening" : "idle", speaking);
      v.setBurning(s.meter.meltdown);
    }
    const speaker = line ? ofs.find((o) => o.id === line.speaker) : null;
    sub.replaceChildren(
      ...[
      line ? h("span", { class: "lc-sub-name", style: `--accent:${speaker?.color ?? "#ffd617"}` }, speaker?.name ?? line.speaker) : null,
      line ? h("span", { class: line.text.length > 240 ? "lc-sub-text longer" : line.text.length > 120 ? "lc-sub-text long" : "lc-sub-text" }, line.text) : h("span", { class: "lc-sub-text dim" }, s.caseId ? "The officials are reviewing your file." : "Waiting for the next applicant. Scan the QR code to volunteer."),
      line?.provisions.length ? h("span", { class: "lc-chips" }, line.provisions.map((p) => h("span", { class: "chip" }, p.label))) : null,
      ].filter((x): x is HTMLSpanElement => !!x),
    );
    sub.classList.toggle("on", !!line);

    eur.set(s.meter.totalEur);
    jail.set(s.meter.totalJailMonths);
    bar.style.width = `${Math.round(meltdownProgress(s.meter) * 100)}%`;
    meterEl.classList.toggle("melted", s.meter.meltdown);
    const f = s.meter.fines.at(-1);
    if (f && f.id !== shownFine) {
      shownFine = f.id;
      lastFine.replaceChildren(
        h("div", { class: "lc-fine-card" }, h("b", null, `+${fmtEurShort(f.amountEur)}`), f.jailMonths ? h("b", { class: "j" }, `+${fmtJail(f.jailMonths)}`) : null, h("span", { class: "chip" }, f.provision.label), h("em", null, f.caption)),
      );
    }

    if (s.analyzing && !analyzing) {
      analyzing = analyzingScreen(ofs);
      overlay.replaceChildren(analyzing.el);
    }
    if (analyzing && !s.analyzing) {
      analyzing.dispose();
      analyzing = null;
    }
    if (analyzing) analyzing.set(s.analyzing!.stage, s.analyzing!.progress);
    else if (s.notice) {
      const n = s.notice;
      const total = isV2Notice(n) ? n.totalEur : n.fineEur;
      const est = turnoverEstimate(n);
      overlay.replaceChildren(
        h(
          "div",
          { class: "lc-verdict" },
          firstImage(["/assets/generated/cutout/stamp-refuse.png"], "lc-stamp-img", "REFUSÉ", () => h("span", { class: "lc-stamp" }, "REFUSÉ")),
          h("div", { class: "lc-verdict-sum" }, h("b", null, fmtEurShort(total)), isV2Notice(n) ? h("span", null, fmtJail(n.totalJailMonths)) : null, h("small", null, `Notice ${n.serial}`), est ? h("small", { class: "lc-turnover" }, turnoverLine(est)) : null),
        ),
      );
    } else if (s.meter.meltdown && !overlay.querySelector(".lc-meltdown")) overlay.replaceChildren(h("div", { class: "lc-meltdown" }, "MELTDOWN"));
    else if (!s.meter.meltdown && !s.notice) overlay.replaceChildren();
    if (s.awaiting && !s.notice && !analyzing) overlay.replaceChildren(h("div", { class: "lc-awaiting" }, "⏳ ", s.awaiting));
    if (s.error) overlay.replaceChildren(h("div", { class: "lc-awaiting" }, s.error));

    mw.set(s.meanwhile);
    wrap.classList.toggle("is-melting", s.meter.meltdown && !s.notice);
  };
  render();
  const off = hub.on((c) => c === "live" && render());
  return () => {
    off();
    analyzing?.dispose();
    views.forEach((v) => v.dispose());
  };
}

/** E — closing slide: a giant MEANWHILE "during this talk", at today's server rates. */
export function endView(root: HTMLElement, hub: Hub, talk: { start: number }): Dispose {
  const mw = new MeanwhileBoard("talk");
  root.replaceChildren(
    h(
      "div",
      { class: "pv pv-end" },
      h("div", { class: "end-kicker" }, "Eurocrat Commission · DG ROAST · Closing statement"),
      mw.el,
      h("p", { class: "end-foot" }, "Thank you for your attention. It has been filed, in triplicate."),
    ),
  );
  const render = () => mw.set(talkMeanwhile((Date.now() - talk.start) / 1000, ratesFrom(hub.stats?.meanwhileToday ?? null)));
  render();
  const t = setInterval(render, 500);
  return () => clearInterval(t);
}
