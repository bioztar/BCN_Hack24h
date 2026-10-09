/**
 * The seam. Everything that talks to a model goes through `Llm`; tests inject a fake,
 * production injects `NebiusLlm` from ./nebius.ts. Nothing else in the server knows a
 * provider exists.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  /** Exact model id, already chosen (primary or fallback) by the caller. */
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  /** Merged verbatim into the request body — carries `chat_template_kwargs.thinking:false`. */
  extraBody: Record<string, unknown>;
  stream: boolean;
  /** Aborting it cancels the HTTP request and its body stream (the engine abandons stalled models). */
  signal?: AbortSignal;
}

export interface Llm {
  /** Yields content deltas as they arrive; a non-streamed call yields once. Throws on failure. */
  stream(req: LlmRequest): AsyncIterable<string>;
}
