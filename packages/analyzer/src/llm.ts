/**
 * The seam to the model. Tests inject a fake `Llm`; production uses `NebiusLlm`. The key is read
 * lazily per call (never at import), so everything loads and tests run without one.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompleteRequest {
  /** Pipeline stage tag, e.g. "classify.ai-act"; fakes route on it. */
  stage: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  temperature?: number;
}

export interface CompleteResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

export interface Llm {
  complete(req: CompleteRequest): Promise<CompleteResult>;
}

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

/** Returns the key or throws naming the variable. Never echoes the value. */
export function requireApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.NEBIUS_API_KEY;
  if (!key) throw new Error("NEBIUS_API_KEY is not set");
  return key;
}

export function buildBody(req: CompleteRequest, model: string): Record<string, unknown> {
  return {
    model,
    messages: req.messages,
    temperature: req.temperature ?? 0.1,
    max_tokens: req.maxOutputTokens,
    stream: false,
    chat_template_kwargs: { thinking: false },
  };
}

interface Completion {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export const DEFAULT_MODEL = "deepseek-ai/DeepSeek-V4-Pro";
export const FALLBACK_MODEL = "moonshotai/Kimi-K3";

function retryable(e: unknown): boolean {
  if (e instanceof NebiusError) return e.status === null || e.status === 404 || e.status === 408 || e.status === 429 || e.status >= 500;
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError" || e instanceof TypeError);
}

export class NebiusLlm implements Llm {
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get model(): string {
    return this.env.NEBIUS_MODEL || this.env.ANALYZER_MODEL || DEFAULT_MODEL;
  }

  get fallbackModel(): string {
    return this.env.NEBIUS_FALLBACK_MODEL || FALLBACK_MODEL;
  }

  /** Primary model first; on an HTTP 404/429/5xx, timeout, network error or empty reply, one retry on the fallback. */
  async complete(req: CompleteRequest): Promise<CompleteResult> {
    requireApiKey(this.env);
    try {
      const r = await this.call(req, this.model);
      if (r.text.trim() || this.fallbackModel === this.model) return r;
    } catch (e) {
      if (this.fallbackModel === this.model || !retryable(e)) throw e;
    }
    return this.call(req, this.fallbackModel);
  }

  private async call(req: CompleteRequest, model: string): Promise<CompleteResult> {
    const key = requireApiKey(this.env);
    const base = this.env.NEBIUS_BASE_URL || NEBIUS_BASE_URL;
    const timeout = Number(this.env.ANALYZER_TIMEOUT_MS) > 0 ? Number(this.env.ANALYZER_TIMEOUT_MS) : 90_000;
    const res = await this.fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(buildBody(req, model)),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new NebiusError(`nebius ${res.status} on ${model} (${req.stage})`, res.status);
    const json = (await res.json()) as Completion;
    return {
      text: json.choices?.[0]?.message?.content ?? "",
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
    };
  }
}

/** Extracts the first JSON object from a model reply (tolerates code fences and prose). */
export function parseJsonReply<T>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("model reply contained no JSON object");
  return JSON.parse(body.slice(start, end + 1)) as T;
}
