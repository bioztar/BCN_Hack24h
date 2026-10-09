/**
 * Settings, read lazily from the environment at the moment they are needed — never at
 * import — so every module loads and the suite runs with no `.env`. A missing key fails
 * at request time with the variable's *name*, never its value.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = process.env.REPO_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function positive(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const paths = {
  corpus: () => process.env.CORPUS_FILE || path.join(REPO_ROOT, "corpus", "provisions.json"),
  personas: () => path.join(REPO_ROOT, "content", "personas"),
  gags: () => path.join(REPO_ROOT, "content", "gags.yaml"),
  assets: () => path.join(REPO_ROOT, "assets", "generated"),
  web: () => path.join(REPO_ROOT, "packages", "web", "dist"),
  pocket: () => path.join(REPO_ROOT, "packages", "pocket", "dist"),
  data: () => process.env.DATA_DIR || path.join(REPO_ROOT, "data"),
};

export const port = () => positive("PORT", 8796);
/** High default: the venue shares one public IP. */
export const rateLimitPerHour = () => positive("RATE_LIMIT_PER_HOUR", 1000);

export interface Profile {
  model: string;
  fallback?: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  extraBody: Record<string, unknown>;
}

/** DeepSeek-V4-Pro first (helm's live test: Kimi-K3 hit the 12 s timeout in 5/10 rounds), Kimi-K3 as fallback. Thinking stays off. */
export const profiles = {
  roast: (): Profile => ({
    model: process.env.NEBIUS_MODEL || "deepseek-ai/DeepSeek-V4-Pro",
    fallback: process.env.NEBIUS_FALLBACK_MODEL || "moonshotai/Kimi-K3",
    temperature: 0.95,
    maxOutputTokens: 900,
    timeoutMs: positive("NEBIUS_TIMEOUT_MS", 12000),
    extraBody: { chat_template_kwargs: { thinking: false }, presence_penalty: 0.5 },
  }),
  cheap: (): Profile => ({
    model: process.env.NEBIUS_CHEAP_MODEL || "deepseek-ai/DeepSeek-V4.1-Flash",
    temperature: 0,
    maxOutputTokens: 200,
    timeoutMs: positive("NEBIUS_CHEAP_TIMEOUT_MS", 4000),
    extraBody: { chat_template_kwargs: { thinking: false } },
  }),
};

export interface SlngConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  sttModel: string;
  sttLanguage: string;
  sttTimeoutMs: number;
  fallbackVoice: { model: string; voice: string };
}

export function slngConfig(): SlngConfig {
  return {
    apiKey: requireEnv("SLNG_API_KEY"),
    baseUrl: process.env.SLNG_BASE_URL || "https://eu-west.api.slng.ai",
    timeoutMs: positive("SLNG_TTS_TIMEOUT_MS", 5000),
    sttModel: process.env.SLNG_STT_MODEL || "deepgram/nova:3",
    sttLanguage: process.env.SLNG_STT_LANGUAGE || "en",
    sttTimeoutMs: positive("SLNG_STT_TIMEOUT_MS", 15000),
    fallbackVoice: {
      model: process.env.SLNG_TTS_FALLBACK_MODEL || "deepgram/aura:2",
      voice: process.env.SLNG_TTS_FALLBACK_VOICE || "aura-2-thalia-en",
    },
  };
}
