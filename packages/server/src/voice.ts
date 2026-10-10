/**
 * SLNG over HTTP. TTS: `POST {base}/v1/tts/{model}`, cached by content hash in memory and on
 * disk under $DATA_DIR/audio, served at /api/audio/:hash.mp3. STT: `POST {base}/v1/stt/{model}`,
 * multipart, Deepgram-shaped response. Both lifted from Karen.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SlngConfig } from "./config.js";

export interface VoiceSpec {
  model: string;
  voice: string;
  /** Fish only: `prosody.speed` (0.5–2). */
  speed?: number;
  /** Fish only: delivery cues added to the spoken text (never to the displayed line). */
  style?: "elderly";
}

export interface Audio {
  audio: Buffer;
  contentType: string;
}

export interface Tts {
  synthesize(text: string, voice: VoiceSpec): Promise<Audio>;
}

export interface Stt {
  transcribe(audio: Buffer, mimeType: string): Promise<string>;
}

type Fetch = typeof fetch;

export const AUDIO_TYPES = /^(audio|video)\/(webm|ogg|mp4|mpeg|wav|x-wav|wave|aac|flac|m4a|x-m4a)(;.*)?$/i;

/** Upload filename extension for a recording type: webm (MediaRecorder), m4a/mp4 (iOS), etc. */
export function sttExt(mimeType: string): string {
  const sub = (mimeType.split(";")[0]?.split("/")[1] ?? "").trim().toLowerCase();
  if (sub === "x-m4a" || sub === "m4a") return "m4a";
  if (sub === "mpeg") return "mp3";
  if (sub === "x-wav" || sub === "wave") return "wav";
  return /^[a-z0-9]+$/.test(sub) ? sub : "bin";
}

export function audioHash(text: string, voice: VoiceSpec): string {
  const extra = `${voice.speed ? `|s${voice.speed}` : ""}${voice.style ? `|${voice.style}` : ""}`;
  return createHash("sha256").update(`${voice.model}|${voice.voice}${extra}|${text}`).digest("hex").slice(0, 32);
}

/** Elderly delivery for Fish (which performs `[sigh]` and ellipsis pauses): a sigh, a pause between sentences, a "dear". */
export function deliveryText(text: string, voice: VoiceSpec): string {
  if (voice.style !== "elderly" || !voice.model.includes("fish")) return text;
  let s = text.replace(/([.!?])\s+(?=\S)/g, "$1 … ");
  if (!/\bdear\b/i.test(s)) s = s.replace(/^([^.!?…]*?\w)([.!?])/, "$1, dear$2");
  return `[sigh] ${s}`;
}

export function ttsBody(spec: VoiceSpec, text: string): Record<string, unknown> {
  if (spec.model.includes("fish")) return { text: deliveryText(text, spec), reference_id: spec.voice, format: "mp3", ...(spec.speed ? { prosody: { speed: spec.speed } } : {}) };
  if (spec.model.includes("aura")) return { text, model: spec.voice, encoding: "mp3" };
  return { text, voice_id: spec.voice };
}

export class SlngTts implements Tts {
  constructor(
    private readonly cfg: () => SlngConfig,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async synthesize(text: string, voice: VoiceSpec): Promise<Audio> {
    const cfg = this.cfg();
    try {
      return await this.request(cfg, voice, text);
    } catch (err) {
      if (cfg.fallbackVoice.voice === voice.voice && cfg.fallbackVoice.model === voice.model && !voice.speed && !voice.style) throw err;
      return this.request(cfg, cfg.fallbackVoice, text);
    }
  }

  private async request(cfg: SlngConfig, spec: VoiceSpec, text: string): Promise<Audio> {
    const res = await this.fetchImpl(`${cfg.baseUrl.replace(/\/$/, "")}/v1/tts/${spec.model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(ttsBody(spec, text)),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("audio/")) throw new Error(`TTS ${spec.model} HTTP ${res.status}`);
    return { audio: Buffer.from(await res.arrayBuffer()), contentType: type };
  }
}

export class SlngStt implements Stt {
  constructor(
    private readonly cfg: () => SlngConfig,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async transcribe(audio: Buffer, mimeType: string): Promise<string> {
    const cfg = this.cfg();
    const ext = sttExt(mimeType);
    const form = new FormData();
    form.set("audio", new Blob([new Uint8Array(audio)], { type: mimeType }), `clip.${ext}`);
    form.set("language", cfg.sttLanguage);
    form.set("punctuate", "true");
    form.set("smart_format", "true");
    const res = await this.fetchImpl(`${cfg.baseUrl.replace(/\/$/, "")}/v1/stt/${cfg.sttModel}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(cfg.sttTimeoutMs),
    });
    if (!res.ok) throw new Error(`STT HTTP ${res.status}`);
    const parsed = (await res.json()) as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } };
    return (parsed.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
  }
}

/** Priority for background pre-rendering: runs only when no live line is waiting. */
export const PRIORITY_IDLE = Number.MAX_SAFE_INTEGER;

/** Content-addressed audio store. `render` never throws: failure → null, the line still goes out. */
export class AudioCache {
  private readonly mem = new Map<string, Audio>();
  private readonly inflight = new Map<string, { flight: Promise<Audio | null>; slot: { priority: number } }>();
  private active = 0;
  private readonly waiting: { slot: { priority: number }; seq: number; go: () => void }[] = [];
  private seq = 0;

  constructor(
    private readonly tts: Tts,
    private readonly dir: string | null,
    private readonly log: (msg: string) => void = () => undefined,
    private readonly concurrency = 3,
    private readonly retryDelayMs = 400,
  ) {
    if (dir) mkdirSync(dir, { recursive: true });
  }

  /** Bounded concurrency (provider rate limits), lowest priority number first, one retry; logs status/class only, never the text. */
  private async synth(text: string, voice: VoiceSpec, slot: { priority: number }): Promise<Audio> {
    if (this.active >= this.concurrency) await new Promise<void>((go) => this.waiting.push({ slot, seq: this.seq++, go }));
    this.active++;
    try {
      for (let attempt = 1; ; attempt++) {
        try {
          return await this.tts.synthesize(text, voice);
        } catch (err) {
          const status = err instanceof Error ? (/\b[1-5]\d\d\b/.exec(err.message)?.[0] ?? "-") : "-";
          this.log(`tts failed (attempt ${attempt}, status ${status}, ${err instanceof Error ? `${err.constructor.name}/${err.name}` : typeof err})`);
          if (attempt >= 2) throw err;
          await new Promise((r) => setTimeout(r, this.retryDelayMs));
        }
      }
    } finally {
      this.active--;
      let next = -1;
      this.waiting.forEach((w, i) => {
        const best = this.waiting[next];
        if (!best || w.slot.priority < best.slot.priority || (w.slot.priority === best.slot.priority && w.seq < best.seq)) next = i;
      });
      if (next >= 0) this.waiting.splice(next, 1)[0]!.go();
    }
  }

  /**
   * `priority`: lower renders first (live lines pass their sequence number). A live line whose text is
   * already queued (e.g. a canned opener still waiting in the idle pre-render) lifts that job to its priority.
   */
  async render(text: string, voice: VoiceSpec, priority = 0): Promise<string | null> {
    const hash = audioHash(text, voice);
    if (this.get(hash)) return `/api/audio/${hash}.mp3`;
    const queued = this.inflight.get(hash);
    if (queued) queued.slot.priority = Math.min(queued.slot.priority, priority);
    let flight = queued?.flight;
    if (!flight) {
      const slot = { priority };
      flight = this.synth(text, voice, slot)
        .then((a) => {
          this.mem.set(hash, a);
          if (this.mem.size > 300) this.mem.delete(this.mem.keys().next().value as string);
          if (this.dir) {
            writeFileSync(path.join(this.dir, `${hash}.bin`), a.audio);
            writeFileSync(path.join(this.dir, `${hash}.type`), a.contentType);
          }
          return a;
        })
        .catch(() => null)
        .finally(() => this.inflight.delete(hash));
      this.inflight.set(hash, { flight, slot });
    }
    return (await flight) ? `/api/audio/${hash}.mp3` : null;
  }

  /** One tiny uncached synthesis to take the provider's cold start for this voice off the first live line. */
  async warm(voice: VoiceSpec, priority = 0): Promise<boolean> {
    try {
      await this.synth("Hm.", voice, { priority });
      return true;
    } catch {
      return false;
    }
  }

  get(hash: string): Audio | null {
    if (!/^[a-f0-9]{32}$/.test(hash)) return null;
    const hit = this.mem.get(hash);
    if (hit) return hit;
    if (!this.dir) return null;
    const file = path.join(this.dir, `${hash}.bin`);
    if (!existsSync(file)) return null;
    const typeFile = path.join(this.dir, `${hash}.type`);
    return { audio: readFileSync(file), contentType: existsSync(typeFile) ? readFileSync(typeFile, "utf8") : "audio/mpeg" };
  }
}
