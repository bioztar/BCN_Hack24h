/** content/personas/<id>.yaml → engine data + the contract's `Persona` (asset URLs only for files that exist). */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { ClipSlot, Persona, PersonaId, Tier } from "@dg-roast/shared";

export interface CannedLine {
  text: string;
  provisions: string[];
}

export interface PersonaSpec {
  id: PersonaId;
  name: string;
  title: string;
  color: string;
  partner?: PersonaId;
  voice: { model: string; voice: string };
  register: string;
  pinch: string[];
  signature: string[];
  stills: Partial<Record<keyof Persona["stills"], string>>;
  model3d?: string;
  clips: Partial<Record<ClipSlot, string>>;
  canned: Partial<Record<Tier, CannedLine>>;
}

export const DEFAULT_PAIR: [PersonaId, PersonaId] = ["formblatt", "annexe"];

export class Roster {
  readonly byId: Map<PersonaId, PersonaSpec>;

  constructor(
    readonly specs: PersonaSpec[],
    /** Maps `/assets/generated/...` URLs to a file on disk; returns false for missing media. */
    private readonly assetExists: (url: string) => boolean = () => true,
  ) {
    this.byId = new Map(specs.map((s) => [s.id, s]));
  }

  static load(dir: string, assetsDir: string): Roster {
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort() : [];
    const specs = files.map((f) => parse(readFileSync(path.join(dir, f), "utf8")) as PersonaSpec);
    const exists = (url: string) => {
      const rel = url.replace(/^\/assets\/generated\//, "");
      if (rel === url || rel.includes("..")) return false;
      return existsSync(path.join(assetsDir, rel));
    };
    return new Roster(specs, exists);
  }

  get(id: PersonaId): PersonaSpec | undefined {
    return this.byId.get(id);
  }

  /** The double acts from PERSONA.md, derived from each YAML's `partner`. */
  pairs(): [PersonaId, PersonaId][] {
    const out: [PersonaId, PersonaId][] = [];
    const seen = new Set<string>();
    for (const s of this.specs) {
      if (!s.partner || !this.byId.has(s.partner)) continue;
      const key = [s.id, s.partner].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([s.id, s.partner]);
    }
    return out.length ? out : [DEFAULT_PAIR];
  }

  randomPair(rand: () => number = Math.random): [PersonaId, PersonaId] {
    const pairs = this.pairs();
    return pairs[Math.floor(rand() * pairs.length)] ?? DEFAULT_PAIR;
  }

  toPersona(id: PersonaId): Persona {
    const s = this.byId.get(id);
    if (!s) throw new Error(`unknown persona ${id}`);
    const keep = <K extends string>(m: Partial<Record<K, string>> | undefined) =>
      Object.fromEntries(Object.entries(m ?? {}).filter(([, v]) => typeof v === "string" && this.assetExists(v as string))) as Partial<Record<K, string>>;
    const clips = keep<ClipSlot>(s.clips);
    const persona: Persona = { id: s.id, name: s.name, title: s.title, stills: keep(s.stills), color: s.color };
    if (Object.keys(clips).length) persona.clips = clips;
    if (s.model3d && this.assetExists(s.model3d)) persona.model3d = s.model3d;
    return persona;
  }

  all(): Persona[] {
    return this.specs.map((s) => this.toPersona(s.id));
  }
}
