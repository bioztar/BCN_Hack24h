import { createHash } from "node:crypto";
import type { Entry, Manifest } from "./manifest.js";

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

export function sha256(v: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");
}

/**
 * Content hash of what a call would produce: everything that reaches the provider,
 * plus the hashes of upstream inputs (reference still, source still, line audio).
 * Notes, categories and cost estimates are excluded so editing them never re-bills.
 */
export class Hasher {
  private memo = new Map<string, string>();
  private byId: Map<string, Entry>;
  constructor(private manifest: Manifest) {
    this.byId = new Map(manifest.assets.map((e) => [e.id, e]));
  }

  entry(id: string): string {
    const hit = this.memo.get(id);
    if (hit) return hit;
    const e = this.byId.get(id);
    if (!e) throw new Error(`unknown asset ${id}`);
    const h = sha256({
      kind: e.kind,
      model: e.provider.model,
      prompt: e.prompt ?? null,
      line: e.kind === "clip-speaking" ? null : (e.line ?? null),
      params: e.params ?? null,
      voice: e.kind === "voice" ? this.voice(e) : null,
      reference: e.reference ? this.entry(e.reference) : null,
      source: e.source_still ? this.entry(e.source_still) : null,
      audio: e.kind === "clip-speaking" ? this.lineAudio(id) : null,
      duration: e.kind === "clip-silent" ? (e.duration_s ?? null) : null,
    });
    this.memo.set(id, h);
    return h;
  }

  /** hash of the TTS audio for a speaking clip's fixed line */
  lineAudio(id: string): string {
    const e = this.byId.get(id);
    if (!e || e.kind !== "clip-speaking") throw new Error(`${id} is not a speaking clip`);
    return sha256({ line: e.line, voice: this.voice(e) });
  }

  private voice(e: Entry): unknown {
    const v = e.voice ? this.manifest.voices[e.voice] : undefined;
    return v ? { model: v.model, voice_id: v.voice_id, speed: v.speed ?? null, line: e.line } : null;
  }
}
