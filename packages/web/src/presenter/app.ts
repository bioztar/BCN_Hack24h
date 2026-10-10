import "./presenter.css";
import { h } from "../dom";
import { MOCK } from "../env";
import type { BoardSort } from "../live/board";
import { httpLiveApi, type LiveApi } from "../live/api";
import { mockWorld } from "../live/mockWorld";
import { unlockAudio } from "../stage/sfx";
import { Hub } from "./hub";
import { firstRun, navHidden, playHref, REPORT_URL, safeStore, setNavHidden } from "./nav";
import { KEYS, parseView, type View } from "./view";
import { arcadeView, boardView, caseView, endView, qrView, type Dispose } from "./views";

export { parseView, type View } from "./view";

const NAV: [View, string, string][] = [["qr", "QR", "Q"], ["board", "Leaderboard", "L"], ["case", "Live case", "C"], ["arcade", "Arcade", "A"], ["end", "End", "E"]];
const TIP = "Presenter? Keys Q L C A E · B hackathon · F full screen · H hide bar";

/** The big-screen presenter: Q = QR intro, L = leaderboard, C = live case, A = arcade, E = closing MEANWHILE. */
export function presenter(root: HTMLElement): void {
  const params = new URLSearchParams(location.search);
  const pace = Number(params.get("pace")) || 1;
  const api: LiveApi = MOCK ? mockWorld({ pace }) : httpLiveApi();
  const sound = params.get("sound") === "1" || (MOCK && params.get("sound") !== "0");
  const hub = new Hub(api, { sound, pinCase: params.get("case") });
  hub.start();
  document.body.classList.add("presenter");

  const screen = h("div", { class: "pv-screen" });
  const store = safeStore();
  const views = h("div", { class: "pv-nav-views" });
  const nav = h(
    "nav",
    { class: "pv-nav", "aria-label": "Stage" },
    MOCK ? h("span", { class: "pv-mock" }, "REHEARSAL") : null,
    views,
    h("a", { class: "pv-nav-play", href: playHref(location.search) }, "▶ Roast my startup on this screen"),
    h(
      "div",
      { class: "pv-nav-links" },
      h("a", { href: "/pocket/" }, "Phone app"),
      h("a", { href: "/game/" }, "Arcade"),
      h("a", { href: REPORT_URL, target: "_blank", rel: "noopener" }, "Real compliance report"),
    ),
    h("button", { class: "pv-nav-hide", title: "Hide this bar (H)", onclick: () => setBar(false) }, "Hide", h("kbd", null, "H")),
  );
  const hint = h("div", { class: "pv-hint" });
  root.replaceChildren(h("div", { class: "pv-root" }, screen, nav, hint));
  const setBar = (visible: boolean) => {
    nav.hidden = !visible;
    setNavHidden(store, !visible);
  };
  nav.hidden = navHidden(store);

  /** E counts "during this talk" from page open; 0 restarts it. */
  const talk = { start: Date.now() };
  const sort: { sort: BoardSort } = { sort: params.get("sort") === "jail" ? "jail" : "fines" };
  let view: View = parseView(params.get("view"));
  let dispose: (Dispose & { toggle?: () => void }) | null = null;

  const show = (v: View) => {
    dispose?.();
    view = v;
    screen.dataset.view = v;
    dispose = v === "qr" ? qrView(screen, hub) : v === "board" ? boardView(screen, hub, sort) : v === "case" ? caseView(screen, hub) : v === "end" ? endView(screen, hub, talk) : arcadeView(screen, api);
    views.replaceChildren(...NAV.map(([k, name, key]) => h("button", { class: k === v ? "on" : "", title: `${name} (${key})`, onclick: () => show(k) }, name, h("kbd", null, key))));
    const u = new URL(location.href);
    u.searchParams.set("view", v);
    history.replaceState(null, "", u);
  };

  let hintT = 0;
  const flash = (text: string) => {
    hint.textContent = text;
    hint.classList.add("on");
    clearTimeout(hintT);
    hintT = window.setTimeout(() => hint.classList.remove("on"), 1600);
  };

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest?.("input,textarea")) return;
    const k = e.key.toLowerCase();
    if (KEYS[k]) return show(KEYS[k]!);
    if (k === "t" && view === "board") return dispose?.toggle?.();
    if (k === "m") {
      hub.toggleSound();
      return flash(hub.sound ? "🔊 Stage sound on" : "🔇 Stage sound off");
    }
    if (k === "b") {
      hub.toggleEvent();
      if (view !== "board") show("board");
      return flash(hub.event ? "🏁 This hackathon only" : "All startups today");
    }
    if (k === "0") {
      talk.start = Date.now();
      return flash("⏱ MEANWHILE: counting from now");
    }
    if (k === "p") {
      hub.togglePin();
      return flash(hub.pinned ? "📌 Pinned to this case" : "Following the newest case");
    }
    if (k === "h") {
      setBar(nav.hidden);
      return flash(nav.hidden ? "Bar hidden — H to show" : "Bar shown — H to hide");
    }
    if (k === "f") void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()).catch?.(() => undefined);
  });
  window.addEventListener("pointerdown", () => unlockAudio(), { once: true });
  show(view);
  if (firstRun(store)) {
    const tip = h("div", { class: "pv-tip", role: "status" }, TIP, h("button", { class: "pv-tip-x", "aria-label": "Dismiss", onclick: () => tip.remove() }, "×"));
    root.append(tip);
    setTimeout(() => tip.remove(), 6000);
  }
}
