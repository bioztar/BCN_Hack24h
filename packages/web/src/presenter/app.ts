import "./presenter.css";
import { h } from "../dom";
import { MOCK } from "../env";
import type { BoardSort } from "../live/board";
import { httpLiveApi, type LiveApi } from "../live/api";
import { mockWorld } from "../live/mockWorld";
import { unlockAudio } from "../stage/sfx";
import { Hub } from "./hub";
import { arcadeView, boardView, caseView, qrView, type Dispose } from "./views";

export type View = "qr" | "board" | "case" | "arcade";
const KEYS: Record<string, View> = { q: "qr", l: "board", c: "case", a: "arcade" };
const NAMES: Record<View, string> = { qr: "Q · Join", board: "L · Leaderboard", case: "C · Live case", arcade: "A · Arcade" };

export function parseView(v: string | null): View {
  const k = (v ?? "").toLowerCase();
  if (k in KEYS) return KEYS[k]!;
  return (["qr", "board", "case", "arcade"] as View[]).find((x) => x === k) ?? (k === "leaderboard" ? "board" : "qr");
}

/** The big-screen presenter: Q = QR intro, L = leaderboard, C = live case, A = arcade. */
export function presenter(root: HTMLElement): void {
  const params = new URLSearchParams(location.search);
  const pace = Number(params.get("pace")) || 1;
  const api: LiveApi = MOCK ? mockWorld({ pace }) : httpLiveApi();
  const sound = params.get("sound") === "1" || (MOCK && params.get("sound") !== "0");
  const hub = new Hub(api, { sound, pinCase: params.get("case") });
  hub.start();
  document.body.classList.add("presenter");

  const screen = h("div", { class: "pv-screen" });
  const nav = h("nav", { class: "pv-nav" });
  const hint = h("div", { class: "pv-hint" });
  root.replaceChildren(h("div", { class: "pv-root" }, screen, nav, hint, MOCK ? h("span", { class: "pv-mock" }, "REHEARSAL — ?mock=1") : null));

  const sort: { sort: BoardSort } = { sort: params.get("sort") === "jail" ? "jail" : "fines" };
  let view: View = parseView(params.get("view"));
  let dispose: (Dispose & { toggle?: () => void }) | null = null;

  const show = (v: View) => {
    dispose?.();
    view = v;
    screen.dataset.view = v;
    dispose = v === "qr" ? qrView(screen, hub) : v === "board" ? boardView(screen, hub, sort) : v === "case" ? caseView(screen, hub) : arcadeView(screen, api);
    nav.replaceChildren(...(Object.keys(NAMES) as View[]).map((k) => h("button", { class: k === v ? "on" : "", onclick: () => show(k) }, NAMES[k])));
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
    if (k === "p") {
      hub.togglePin();
      return flash(hub.pinned ? "📌 Pinned to this case" : "Following the newest case");
    }
    if (k === "f") void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()).catch?.(() => undefined);
  });
  window.addEventListener("pointerdown", () => unlockAudio(), { once: true });
  show(view);
}
