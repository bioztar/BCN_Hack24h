import "./styles.css";
import { FIXED_PAIRS, httpApi, pairName, type Pair } from "./api";
import type { Persona, PersonaId } from "./contract";
import { h } from "./dom";
import { MOCK, SKIP_INTRO } from "./env";
import { MOCK_PERSONAS, mockApi } from "./mock";
import { cookieBanner } from "./ui/banner";
import { chrome } from "./ui/chrome";
import { hearing } from "./ui/hearing";
import { submitScreen } from "./ui/submit";
import { queueTicket } from "./ui/ticket";

const api = MOCK ? mockApi() : httpApi();
const root = document.getElementById("app") ?? document.body;

function stub(id: PersonaId): Persona {
  const fromMock = MOCK_PERSONAS.find((p) => p.id === id);
  if (fromMock) return { ...fromMock, stills: {}, clips: undefined, model3d: undefined };
  return { id, name: id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), title: "Official", stills: {}, color: "#003399" };
}

async function allocate(): Promise<{ pair: Pair; officers: [Persona, Persona] }> {
  const [personas, pairs] = await Promise.all([
    api.personas().catch((err) => (console.warn("[stage] personas", err), [] as Persona[])),
    api.pairs().catch((err) => (console.warn("[stage] pairs", err), FIXED_PAIRS)),
  ]);
  const usable = (pairs.length ? pairs : FIXED_PAIRS).filter((p) => Array.isArray(p.officers) && p.officers.length === 2);
  const pool = usable.length ? usable : FIXED_PAIRS;
  const known = pool.filter((p) => p.officers.every((id) => personas.some((x) => x.id === id)));
  const choices = known.length ? known : pool;
  const pair = choices[Math.floor(Math.random() * choices.length)]!;
  const find = (id: PersonaId) => personas.find((p) => p.id === id) ?? stub(id);
  return { pair, officers: [find(pair.officers[0]), find(pair.officers[1])] };
}

async function main() {
  const allocation = allocate();
  if (!SKIP_INTRO) await cookieBanner(root);
  const { pair, officers } = await allocation;
  const name = pairName(pair.id);
  if (!SKIP_INTRO) await queueTicket(root, officers, name);
  for (;;) {
    const sub = await submitScreen(root, api);
    try {
      const kase = await api.createCase(sub, pair.officers);
      hearing(root, api, kase, officers, name, sub);
      return;
    } catch (err) {
      const msg = (err as Error).message;
      const again = h("button", { class: "btn primary" }, "Fill in the form again");
      const box = h("div", { class: "error-box" }, h("h2", null, "Your file could not be registered"), h("p", null, msg), again, h("a", { class: "btn", href: "/?mock=1" }, "Use the rehearsal file (?mock=1)"));
      root.replaceChildren(chrome(box, "ERR(2026) 4812 final"));
      await new Promise<void>((r) => again.addEventListener("click", () => r(), { once: true }));
    }
  }
}

void main();
