export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface FalProvider {
  /** Runs a fal model through the queue API and returns the bytes of the first output file. */
  generate(model: string, input: Record<string, unknown>): Promise<Uint8Array>;
}

export interface TtsOptions {
  speed?: number;
  format?: "mp3" | "wav";
}

export interface SlngProvider {
  tts(model: string, voiceId: string, text: string, opts?: TtsOptions): Promise<Uint8Array>;
}

export interface Providers {
  fal: FalProvider;
  slng: SlngProvider;
}

export class ProviderError extends Error {}
