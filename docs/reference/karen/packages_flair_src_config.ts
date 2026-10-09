/**
 * Flair settings, read lazily from the environment at the moment a client needs them —
 * never at import. Modules load and tests run with no `.env` at all; a missing key fails
 * at request time with the setting's *name*, never its value.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

export type Speaker = "karen" | "brad";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** One SLNG TTS route (`/v1/tts/{model}`) and the voice id it is asked for. */
export interface VoiceSpec {
  model: string;
  voice: string;
}

export interface SlngConfig {
  apiKey: string;
  baseUrl: string;
  /** Each speaker's own voice. */
  voices: Record<Speaker, VoiceSpec>;
  /** Tried once, per speaker, when the primary fails or overruns `timeoutMs`. */
  fallback: Record<Speaker, VoiceSpec>;
  timeoutMs: number;
  cacheSize: number;
}

export interface SttConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  language: string;
  timeoutMs: number;
}

/** Karen's gavel voice: Fish s2.1-pro, reference `16cabdb7…`. */
export const KAREN_VOICE: VoiceSpec = { model: "slng/fish/tts:s2.1-pro", voice: "16cabdb7f8d240569aff36c9e480d783" };
export const BRAD_VOICE: VoiceSpec = { model: "deepgram/aura:2", voice: "aura-2-orion-en" };
export const FALLBACK_VOICE: VoiceSpec = { model: "deepgram/aura:2", voice: "aura-2-thalia-en" };
export const STT_MODEL = "deepgram/nova:3";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function envMs(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function slngConfig(): SlngConfig {
  const fallback: VoiceSpec = {
    model: process.env.SLNG_TTS_FALLBACK_MODEL || FALLBACK_VOICE.model,
    voice: process.env.SLNG_TTS_FALLBACK_VOICE || FALLBACK_VOICE.voice,
  };
  const brad: VoiceSpec = {
    model: process.env.SLNG_TTS_MODEL_BRAD || BRAD_VOICE.model,
    voice: process.env.SLNG_TTS_VOICE_BRAD || BRAD_VOICE.voice,
  };
  return {
    apiKey: requireEnv("SLNG_API_KEY"),
    baseUrl: process.env.SLNG_BASE_URL || "https://eu-west.api.slng.ai",
    voices: {
      karen: {
        model: process.env.SLNG_TTS_MODEL || KAREN_VOICE.model,
        voice: process.env.SLNG_TTS_VOICE || KAREN_VOICE.voice,
      },
      brad,
    },
    // Brad is already on Aura; his retry is the same voice again.
    fallback: { karen: fallback, brad },
    timeoutMs: envMs("SLNG_TTS_TIMEOUT_MS", 6000),
    cacheSize: 256,
  };
}

export function sttConfig(): SttConfig {
  return {
    apiKey: requireEnv("SLNG_API_KEY"),
    baseUrl: process.env.SLNG_BASE_URL || "https://eu-west.api.slng.ai",
    model: process.env.SLNG_STT_MODEL || STT_MODEL,
    language: process.env.SLNG_STT_LANGUAGE || "en",
    timeoutMs: envMs("SLNG_STT_TIMEOUT_MS", 15000),
  };
}

export interface NebiusConfig {
  apiKey: string;
  baseUrl: string;
}

export function nebiusConfig(): NebiusConfig {
  return {
    apiKey: requireEnv("NEBIUS_API_KEY"),
    baseUrl: process.env.NEBIUS_BASE_URL || "https://api.studio.nebius.com/v1",
  };
}

export function modelsYamlPath(): string {
  return process.env.MODELS_YAML || path.join(REPO_ROOT, "config", "models.yaml");
}

export function dataDir(): string {
  return process.env.DATA_DIR || path.join(REPO_ROOT, "data");
}

/** `$DATA_DIR/karen.sqlite`, the one file ARCHITECTURE.md allows. */
export function sqlitePath(): string {
  return path.join(dataDir(), "karen.sqlite");
}

/** Host shown on the receipt card, from PUBLIC_ORIGIN. */
export function publicHost(): string {
  const origin = process.env.PUBLIC_ORIGIN || "https://karen.pro7ocol.com";
  try {
    return new URL(origin).host;
  } catch {
    return "karen.pro7ocol.com";
  }
}

export function rateLimitPerHour(): number {
  const n = Number(process.env.RATE_LIMIT_PER_HOUR);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

/** Origin fal and other third parties fetch our public URLs from (clips, the reference image). */
export function publicOrigin(): string {
  const origin = process.env.PUBLIC_ORIGIN || "https://karen.pro7ocol.com";
  try {
    return new URL(origin).origin;
  } catch {
    return "https://karen.pro7ocol.com";
  }
}

export interface LiveConfig {
  /** Present when FAL_API_KEY (or FAL_KEY) is set. Never logged, never sent to the browser. */
  apiKey: string | null;
  /** The only fal app the proxy will negotiate a session for. */
  endpoint: string;
  bridgeUrl: string;
  maxSessions: number;
  maxSeconds: number;
  idleSeconds: number;
  /** Proxy calls per IP per rolling minute. Heartbeats are one every 5 s. */
  proxyPerMinute: number;
  /** An ended session keeps its slot this long, covering the bridge's own lease timeout. */
  cooldownSeconds: number;
  /** Hard ceiling on streamed seconds per UTC day, all visitors together. */
  dailySeconds: number;
  /** Streamed seconds per client (cookie + IP) per UTC day. */
  perClientSeconds: number;
}

function positiveInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function liveConfig(): LiveConfig {
  return {
    apiKey: process.env.FAL_API_KEY || process.env.FAL_KEY || null,
    endpoint: process.env.KAREN_LIVE_ENDPOINT || "minimax/h3-max/director",
    bridgeUrl: process.env.KAREN_LIVE_BRIDGE_URL || "https://wma.fal.run",
    maxSessions: positiveInt("KAREN_LIVE_MAX_SESSIONS", 2),
    maxSeconds: positiveInt("KAREN_LIVE_MAX_SECONDS", 150),
    idleSeconds: positiveInt("KAREN_LIVE_IDLE_SECONDS", 60),
    proxyPerMinute: positiveInt("KAREN_LIVE_PROXY_PER_MINUTE", 60),
    cooldownSeconds: positiveInt("KAREN_LIVE_COOLDOWN_SECONDS", 90),
    dailySeconds: positiveInt("KAREN_LIVE_DAILY_SECONDS", 900),
    perClientSeconds: positiveInt("KAREN_LIVE_PER_CLIENT_SECONDS", 300),
  };
}

export function avatarPath(speaker: Speaker): string {
  return path.join(REPO_ROOT, "assets", "karen", speaker === "brad" ? "brad.png" : "karen.png");
}
