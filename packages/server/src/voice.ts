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
  return createHash("sha256").update(`${voice.model}|${voice.voice}|${text}`).digest("hex").slice(0, 32);
}

function ttsBody(model: string, voice: string, text: string): Record<string, string> {
  if (model.includes("fish")) return { text, reference_id: voice, format: "mp3" };
  if (model.includes("aura")) return { text, model: voice, encoding: "mp3" };
  return { text, voice_id: voice };
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
      if (cfg.fallbackVoice.voice === voice.voice && cfg.fallbackVoice.model === voice.model) throw err;
      return this.request(cfg, cfg.fallbackVoice, text);
    }
  }

  private async request(cfg: SlngConfig, spec: VoiceSpec, text: string): Promise<Audio> {
    const res = await this.fetchImpl(`${cfg.baseUrl.replace(/\/$/, "")}/v1/tts/${spec.model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(ttsBody(spec.model, spec.voice, text)),
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
  private readonly inflight = new Map<string, Promise<Audio | null>>();
  private active = 0;
  private readonly waiting: { priority: number; seq: number; go: () => void }[] = [];
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
  private async synth(text: string, voice: VoiceSpec, priority: number): Promise<Audio> {
    if (this.active >= this.concurrency) await new Promise<void>((go) => this.waiting.push({ priority, seq: this.seq++, go }));
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
        if (!best || w.priority < best.priority || (w.priority === best.priority && w.seq < best.seq)) next = i;
      });
      if (next >= 0) this.waiting.splice(next, 1)[0]!.go();
    }
  }

  /** `priority`: lower renders first (live lines pass their sequence number). */
  async render(text: string, voice: VoiceSpec, priority = 0): Promise<string | null> {
    const hash = audioHash(text, voice);
    if (this.get(hash)) return `/api/audio/${hash}.mp3`;
    let flight = this.inflight.get(hash);
    if (!flight) {
      flight = this.synth(text, voice, priority)
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
      this.inflight.set(hash, flight);
    }
    return (await flight) ? `/api/audio/${hash}.mp3` : null;
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
