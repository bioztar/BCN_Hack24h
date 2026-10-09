import { existsSync } from "node:fs";
import { join } from "node:path";
import { Hasher } from "./hash.js";
import type { Entry, Kind, Manifest, ProviderRef, Unit } from "./manifest.js";
import type { State } from "./state.js";

/** run order = budget priority: stills, then 3D busts, then voice audio, then clips */
export const STAGES = ["stills", "models3d", "voices", "clips"] as const;
export type Stage = (typeof STAGES)[number];

export const FAL_QUEUE = "https://queue.fal.run";
export const SLNG_BASE = "https://eu-west.api.slng.ai";

/** A file produced by an earlier call; resolved to a data URI only at execution time. */
export interface FileRef {
  $file: string;
}

export interface Call {
  stage: Stage;
  /** manifest asset id */
  asset: string;
  /** what is produced: the asset itself, or the TTS audio of a speaking clip's line */
  produces: Kind | "line-audio";
  provider: "fal" | "slng";
  model: string;
  endpoint: string;
  qty: number;
  unit: Unit;
  unitCost: number;
  cost: number;
  /** output path relative to the generated dir, e.g. still/formblatt-neutral.png */
  rel: string;
  hash: string;
  skip: boolean;
  /** fal: request body (FileRefs inside); slng: TTS request */
  input: Record<string, unknown>;
  tts?: { voiceId: string; text: string; speed?: number };
  /** generated files (relative) this call reads */
  deps: string[];
}

const DIR: Record<Kind | "line-audio", string> = {
  still: "still",
  voice: "voice",
  "line-audio": "line",
  "clip-speaking": "clip",
  "clip-silent": "clip",
  model3d: "3d",
};
const EXT: Record<Kind | "line-audio", string> = {
  still: "png",
  voice: "mp3",
  "line-audio": "mp3",
  "clip-speaking": "mp4",
  "clip-silent": "mp4",
  model3d: "glb",
};

export function outputRel(kind: Kind | "line-audio", id: string): string {
  return `${DIR[kind]}/${id}.${EXT[kind]}`;
}

function qtyFor(unit: Unit, durationS: number | undefined): number {
  if (unit === "image" || unit === "generation") return 1;
  const d = durationS ?? 0;
  return unit === "second" ? d : d / 60;
}

export function round(usd: number): number {
  return Math.round(usd * 10_000) / 10_000;
}

function endpointFor(p: ProviderRef): string {
  return p.provider === "fal" ? `${FAL_QUEUE}/${p.model}` : `${SLNG_BASE}/v1/tts/${p.model}`;
}

function stageOf(kind: Kind): Stage {
  if (kind === "still") return "stills";
  if (kind === "voice") return "voices";
  if (kind === "model3d") return "models3d";
  return "clips";
}

function file(rel: string): FileRef {
  return { $file: rel };
}

export interface PlanOptions {
  outDir: string;
  state: State;
  force?: boolean;
  only?: string[];
  includeOptional?: boolean;
}

export function planStage(manifest: Manifest, stage: Stage, opts: PlanOptions): Call[] {
  const hasher = new Hasher(manifest);
  const calls: Call[] = [];
  const isDone = (rel: string, hash: string) =>
    !opts.force && opts.state.outputs[rel]?.hash === hash && existsSync(join(opts.outDir, rel));
  const make = (e: Entry, produces: Call["produces"], p: ProviderRef, hash: string, rest: Partial<Call>): Call => {
    const rel = outputRel(produces, e.id);
    const qty = qtyFor(p.unit, e.duration_s);
    return {
      stage,
      asset: e.id,
      produces,
      provider: p.provider,
      model: p.model,
      endpoint: endpointFor(p),
      qty,
      unit: p.unit,
      unitCost: p.unit_cost_usd,
      cost: round(qty * p.unit_cost_usd),
      rel,
      hash,
      skip: isDone(rel, hash),
      input: {},
      deps: [],
      ...rest,
    };
  };

  let entries = manifest.assets.filter(
    (e) => (opts.only?.length ? opts.only.includes(e.id) : true) && (opts.includeOptional || !e.optional),
  );
  if (stage === "stills") entries = [...entries].sort((a, b) => Number(!!a.reference) - Number(!!b.reference));

  for (const e of entries) {
    const params = e.params ?? {};
    if (stage === "voices" && e.kind === "clip-speaking") {
      const v = manifest.voices[e.voice!]!;
      calls.push(
        make(e, "line-audio", v, hasher.lineAudio(e.id), {
          input: { voice: e.voice },
          tts: { voiceId: v.voice_id, text: e.line!, speed: v.speed },
        }),
      );
      continue;
    }
    if (stageOf(e.kind) !== stage) continue;
    const hash = hasher.entry(e.id);
    switch (e.kind) {
      case "still": {
        const deps = e.reference ? [outputRel("still", e.reference)] : [];
        const input: Record<string, unknown> = { prompt: e.prompt, output_format: "png", ...params };
        if (e.reference) input.image_urls = [file(deps[0]!)];
        calls.push(make(e, "still", e.provider, hash, { input, deps }));
        break;
      }
      case "voice": {
        const v = manifest.voices[e.voice!]!;
        calls.push(
          make(e, "voice", v, hash, {
            input: { voice: e.voice },
            tts: { voiceId: v.voice_id, text: e.line!, speed: v.speed },
          }),
        );
        break;
      }
      case "model3d": {
        const src = outputRel("still", e.source_still!);
        calls.push(make(e, "model3d", e.provider, hash, { input: { image_url: file(src), ...params }, deps: [src] }));
        break;
      }
      case "clip-silent": {
        const src = outputRel("still", e.source_still!);
        calls.push(
          make(e, "clip-silent", e.provider, hash, {
            input: { prompt: e.prompt, image_url: file(src), duration: e.duration_s, ...params },
            deps: [src],
          }),
        );
        break;
      }
      case "clip-speaking": {
        const src = outputRel("still", e.source_still!);
        const audio = outputRel("line-audio", e.id);
        calls.push(
          make(e, "clip-speaking", e.provider, hash, {
            input: { image_url: file(src), audio_url: file(audio), ...params },
            deps: [src, audio],
          }),
        );
        break;
      }
    }
  }
  return calls;
}

export function describeInput(input: Record<string, unknown>): string {
  return JSON.stringify(input, (_k, v) =>
    v && typeof v === "object" && "$file" in v ? `<file ${(v as FileRef).$file}>` : v,
  );
}
