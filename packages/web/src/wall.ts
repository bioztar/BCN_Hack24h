import "./styles.css";
import { httpApi } from "./api";
import type { Persona, WallEntry } from "./contract";
import { h } from "./dom";
import { MOCK, POCKET_URL, withFlags } from "./env";
import { MOCK_PERSONAS, mockApi } from "./mock";
import { emblem } from "./ui/chrome";
import { qrBox } from "./ui/qr";

const api = MOCK ? mockApi() : httpApi();
const root = document.getElementById("app") ?? document.body;
const MAX = 40;
let personas: Persona[] = MOCK ? MOCK_PERSONAS : [];
let serial = 4812;

const list = h("ol", { class: "oj-list", "aria-live": "polite" });
const count = h("span", null, "0");
const clock = h("span");
root.replaceChildren(
  h(
    "div",
    { class: "oj" },
    h(
      "header",
      { class: "oj-head" },
      emblem(),
      h("div", null, h("h1", null, "Official Journal of the European Union"), h("p", null, "Series R (Rejected) — Live edition. Officials' remarks only; applicants are not quoted, for their protection.")),
      h("div", { class: "oj-meta" }, h("b", null, "R 4812"), clock, h("span", null, "Entries: ", count), MOCK ? h("span", { class: "mock-badge" }, "REHEARSAL") : null),
      h("a", { class: "oj-pocket", href: POCKET_URL, target: "_blank", rel: "noopener" }, qrBox(POCKET_URL, "Get your Pocket Eurocrat", 140)),
    ),
    list,
    h("footer", { class: "oj-foot" }, "All officials are fictional. Every citation is real. ", h("a", { href: withFlags("/") }, "Submit your startup ▸")),
  ),
);

setInterval(() => (clock.textContent = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "medium" })), 1000);

function add(e: WallEntry) {
  const p = personas.find((x) => x.id === e.speaker);
  const at = new Date(e.at);
  const time = isNaN(at.getTime()) ? "" : at.toLocaleTimeString("en-GB");
  const li = h(
    "li",
    { class: "oj-entry", style: `--accent:${p?.color ?? "#003399"}` },
    h("div", { class: "oj-no" }, `No ${serial++}/2026`, h("small", null, time)),
    h("blockquote", null, `“${e.text}”`, h("cite", null, `— ${p?.name ?? e.speaker}${p ? `, ${p.title}` : ""}`)),
  );
  list.prepend(li);
  while (list.childElementCount > MAX) list.lastElementChild?.remove();
  count.textContent = String(serial - 4812);
}

api.personas().then((ps) => (personas = ps.length ? ps : personas)).catch(() => undefined);
void api.wall(add, new AbortController().signal);
