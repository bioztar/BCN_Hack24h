/**
 * SLNG speech-to-text over HTTP, one request per utterance — the same route gavel's
 * `ears` uses: `POST {base}/v1/stt/{model}`, multipart `audio` plus Deepgram options,
 * Bearer auth. The response is Deepgram-shaped: `results.channels[0].alternatives[0]`.
 */
import type { SttConfig } from "./config.js";

export interface Transcript {
  text: string;
  confidence: number | null;
}

export interface Stt {
  transcribe(audio: Buffer, mimeType: string): Promise<Transcript>;
}

type Fetch = typeof fetch;

/** What a browser's MediaRecorder is willing to hand over, and nothing else. */
export const AUDIO_TYPES = /^(audio|video)\/(webm|ogg|mp4|mpeg|wav|x-wav|wave|aac|flac|m4a|x-m4a)(;.*)?$/i;

const EXT: Record<string, string> = { webm: "webm", ogg: "ogg", mp4: "mp4", mpeg: "mp3", wav: "wav", "x-wav": "wav", wave: "wav", aac: "aac", flac: "flac", m4a: "m4a", "x-m4a": "m4a" };

export function filenameFor(mimeType: string): string {
  const sub = mimeType.split(";")[0]?.split("/")[1]?.toLowerCase() ?? "";
  return `clip.${EXT[sub] ?? "bin"}`;
}

interface DeepgramShape {
  results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; confidence?: number }> }> };
}

export class SlngStt implements Stt {
  constructor(
    private cfg: () => SttConfig,
    private fetchImpl: Fetch = fetch,
  ) {}

  async transcribe(audio: Buffer, mimeType: string): Promise<Transcript> {
    const cfg = this.cfg();
    const form = new FormData();
    form.set("audio", new Blob([new Uint8Array(audio)], { type: mimeType }), filenameFor(mimeType));
    form.set("language", cfg.language);
    form.set("punctuate", "true");
    form.set("smart_format", "true");
    const res = await this.fetchImpl(`${cfg.baseUrl.replace(/\/$/, "")}/v1/stt/${cfg.model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
    if (!res.ok) throw new Error(`STT HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    let parsed: DeepgramShape;
    try {
      parsed = (await res.json()) as DeepgramShape;
    } catch {
      throw new Error("STT returned something that is not JSON");
    }
    const alt = parsed.results?.channels?.[0]?.alternatives?.[0];
    if (!alt) throw new Error("STT response had no transcript");
    return { text: (alt.transcript ?? "").trim(), confidence: typeof alt.confidence === "number" ? alt.confidence : null };
  }
}
