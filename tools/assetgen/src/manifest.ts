import { readFileSync } from "node:fs";
import { parse } from "yaml";

export const KINDS = ["still", "voice", "clip-speaking", "clip-silent", "model3d"] as const;
export const PERSONAS = [
  "formblatt",
  "annexe",
  "trilogue",
  "grandma-gdpr",
  "kevin",
  "auditor-9000",
  "chad",
  "de-vries",
  "sandbox",
  "the-cookie",
] as const;
export const OFFICIALS = [...PERSONAS, "shared"] as const;
export const EXPRESSIONS = ["neutral", "stamping", "smug", "appalled", "asleep"] as const;
export const UNITS = ["image", "generation", "second", "minute"] as const;

export type Kind = (typeof KINDS)[number];
export type Official = (typeof OFFICIALS)[number];
export type Unit = (typeof UNITS)[number];

export interface ProviderRef {
  provider: "fal" | "slng";
  model: string;
  unit: Unit;
  unit_cost_usd: number;
}

export interface VoiceSpec extends ProviderRef {
  provider: "slng";
  voice_id: string;
  speed?: number;
}

export interface Entry {
  id: string;
  kind: Kind;
  official: Official;
  category?: string;
  prompt?: string;
  line?: string;
  /** still id whose output is passed as the identity reference (edit model) */
  reference?: string;
  /** still id the clip animates / the 3D model is lifted from */
  source_still?: string;
  /** voice key (into manifest.voices) for voice samples and speaking clips */
  voice?: string;
  duration_s?: number;
  provider: ProviderRef;
  params?: Record<string, unknown>;
  /** skipped unless --include-optional (budget allowing) */
  optional?: boolean;
  notes?: string;
}

export interface Manifest {
  version: number;
  voices: Record<string, VoiceSpec>;
  assets: Entry[];
}

export class ManifestError extends Error {}

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function checkProvider(where: string, p: unknown, errors: string[]): void {
  const r = p as Partial<ProviderRef> | undefined;
  if (!r || typeof r !== "object") {
    errors.push(`${where}: missing provider`);
    return;
  }
  if (r.provider !== "fal" && r.provider !== "slng") errors.push(`${where}: provider must be fal|slng`);
  if (!r.model || typeof r.model !== "string") errors.push(`${where}: provider.model missing`);
  if (!UNITS.includes(r.unit as Unit)) errors.push(`${where}: provider.unit must be ${UNITS.join("|")}`);
  if (typeof r.unit_cost_usd !== "number" || !(r.unit_cost_usd >= 0))
    errors.push(`${where}: provider.unit_cost_usd must be a number >= 0`);
}

export function validateManifest(raw: unknown): Manifest {
  const m = raw as Partial<Manifest>;
  const errors: string[] = [];
  if (!m || typeof m !== "object") throw new ManifestError("manifest is not a mapping");
  if (!Array.isArray(m.assets)) throw new ManifestError("manifest.assets must be a list");
  const voices = (m.voices ?? {}) as Record<string, VoiceSpec>;
  for (const [k, v] of Object.entries(voices)) {
    checkProvider(`voices.${k}`, v, errors);
    if (v?.provider !== "slng") errors.push(`voices.${k}: provider must be slng`);
    if (!v?.voice_id) errors.push(`voices.${k}: voice_id missing`);
  }
  const ids = new Map<string, Entry>();
  for (const [i, e] of m.assets.entries()) {
    const where = `assets[${i}]${e?.id ? ` (${e.id})` : ""}`;
    if (!e?.id || !ID_RE.test(e.id)) errors.push(`${where}: id must match ${ID_RE}`);
    else if (ids.has(e.id)) errors.push(`${where}: duplicate id`);
    else ids.set(e.id, e);
    if (!KINDS.includes(e?.kind)) errors.push(`${where}: kind must be ${KINDS.join("|")}`);
    if (!OFFICIALS.includes(e?.official)) errors.push(`${where}: official must be ${OFFICIALS.join("|")}`);
    checkProvider(where, e?.provider, errors);
    if (e?.optional !== undefined && typeof e.optional !== "boolean") errors.push(`${where}: optional must be true|false`);
    switch (e?.kind) {
      case "still":
        if (!e.prompt) errors.push(`${where}: still needs prompt`);
        if (e.provider?.provider !== "fal" || e.provider?.unit !== "image")
          errors.push(`${where}: still must use a fal per-image model`);
        break;
      case "voice":
      case "clip-speaking":
        if (!e.line) errors.push(`${where}: ${e.kind} needs line`);
        if (!e.voice || !voices[e.voice]) errors.push(`${where}: voice must reference manifest.voices`);
        if (!(typeof e.duration_s === "number" && e.duration_s > 0)) errors.push(`${where}: duration_s required`);
        if (e.kind === "voice" && e.provider?.provider !== "slng") errors.push(`${where}: voice must use slng`);
        if (e.kind === "clip-speaking") {
          if (!e.source_still) errors.push(`${where}: clip needs source_still`);
          if (e.provider?.provider !== "fal") errors.push(`${where}: clip must use fal`);
        }
        break;
      case "model3d":
        if (!e.source_still) errors.push(`${where}: model3d needs source_still`);
        if (e.provider?.provider !== "fal") errors.push(`${where}: model3d must use fal`);
        break;
      case "clip-silent":
        if (!e.prompt) errors.push(`${where}: clip-silent needs prompt`);
        if (!e.source_still) errors.push(`${where}: clip needs source_still`);
        if (!(typeof e.duration_s === "number" && e.duration_s > 0)) errors.push(`${where}: duration_s required`);
        if (e.provider?.provider !== "fal") errors.push(`${where}: clip must use fal`);
        break;
    }
  }
  for (const e of m.assets) {
    for (const key of ["reference", "source_still"] as const) {
      const ref = e?.[key];
      if (!ref) continue;
      const target = ids.get(ref);
      if (!target) errors.push(`${e.id}: ${key} '${ref}' not found`);
      else if (target.kind !== "still") errors.push(`${e.id}: ${key} '${ref}' is not a still`);
      else if (key === "reference" && target.reference) errors.push(`${e.id}: reference '${ref}' must be a root still`);
      else if (target.optional && !e.optional) errors.push(`${e.id}: depends on optional '${ref}' so must be optional too`);
    }
  }
  if (errors.length) throw new ManifestError(`invalid manifest:\n  - ${errors.join("\n  - ")}`);
  return { version: m.version ?? 1, voices, assets: m.assets };
}

export function loadManifest(path: string): Manifest {
  return validateManifest(parse(readFileSync(path, "utf8"), { merge: true }));
}
