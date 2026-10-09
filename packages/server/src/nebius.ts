/**
 * Nebius Token Factory, OpenAI-compatible `/v1/chat/completions`. The only file that knows
 * the API key exists. The key is read lazily per call, never at import, so every module
 * loads and the test suite runs on a machine with no key.
 */
import type { Llm, LlmRequest } from "./llm.js";

export const NEBIUS_BASE_URL = "https://api.studio.nebius.com/v1";

export class NebiusError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "NebiusError";
  }
}

/** Returns the key or throws naming the setting. Never echoes any part of the value. */
export function requireApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.NEBIUS_API_KEY;
  if (!key) throw new Error("NEBIUS_API_KEY is not set");
  return key;
}

/** The wire body for a request. Pure, so tests can assert `thinking:false` without a network. */
export function buildBody(req: LlmRequest): Record<string, unknown> {
  return {
    ...req.extraBody,
    model: req.model,
    messages: req.messages,
    temperature: req.temperature,
    max_tokens: req.maxOutputTokens,
    stream: req.stream,
  };
}

interface Chunk {
  choices?: { delta?: { content?: string | null }; message?: { content?: string | null } }[];
}

export class NebiusLlm implements Llm {
  constructor(
    private readonly baseUrl: string = NEBIUS_BASE_URL,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async *stream(req: LlmRequest): AsyncIterable<string> {
    const key = requireApiKey(this.env);
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(buildBody(req)),
      signal: req.signal ? AbortSignal.any([AbortSignal.timeout(req.timeoutMs), req.signal]) : AbortSignal.timeout(req.timeoutMs),
    });
    if (!res.ok) throw new NebiusError(`nebius ${res.status} on ${req.model}`, res.status);

    if (!req.stream) {
      const json = (await res.json()) as Chunk;
      const text = json.choices?.[0]?.message?.content ?? "";
      if (text) yield text;
      return;
    }
    if (!res.body) throw new NebiusError(`nebius returned no body on ${req.model}`, res.status);
    yield* readSse(res.body);
  }
}

/** Parses an OpenAI-style SSE body into content deltas. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        let chunk: Chunk;
        try {
          chunk = JSON.parse(data) as Chunk;
        } catch {
          continue;
        }
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
    }
  } finally {
    // Never await the cancel: on a stalled body it may not settle, and the caller has already moved on.
    void reader.cancel().catch(() => undefined);
  }
}
