import { ProviderError, type FetchLike, type SlngProvider, type TtsOptions } from "./types.js";

export interface SlngConfig {
  apiKey: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

/** Request body per SLNG model family (POST /v1/tts/<model>). Stock voices only — no reference audio. */
export function ttsBody(model: string, voiceId: string, text: string, opts: TtsOptions = {}): Record<string, unknown> {
  if (model.includes("/fish/")) {
    return {
      text,
      reference_id: voiceId,
      format: opts.format ?? "mp3",
      ...(opts.speed ? { prosody: { speed: opts.speed } } : {}),
    };
  }
  // Aura over HTTP defaults to linear16 WAV; ask for MP3 so the .mp3 output path is honest.
  if (model.includes("deepgram/aura")) return { text, model: voiceId, encoding: opts.format ?? "mp3" };
  return { text, voice: voiceId };
}

export class SlngHttp implements SlngProvider {
  private base: string;
  private f: FetchLike;
  constructor(private cfg: SlngConfig) {
    this.base = (cfg.baseUrl ?? "https://eu-west.api.slng.ai").replace(/\/$/, "");
    this.f = cfg.fetch ?? ((u, i) => fetch(u, i));
  }

  async tts(model: string, voiceId: string, text: string, opts?: TtsOptions): Promise<Uint8Array> {
    const res = await this.f(`${this.base}/v1/tts/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(ttsBody(model, voiceId, text, opts)),
    });
    if (!res.ok) throw new ProviderError(`SLNG ${model} failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("json")) throw new ProviderError(`SLNG ${model} returned JSON, expected audio: ${await res.text()}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}
