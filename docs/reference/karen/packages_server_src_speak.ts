/**
 * One persona turn: primary model, retry once on the profile's fallback, then a canned
 * line. Output is shaped on the way through. Whatever happens, `text` is non-empty —
 * Karen is never silent and never shows an error toast.
 */
import type { Profile } from "./config.js";
import type { ChatMessage, Llm } from "./llm.js";
import { canned } from "./persona/canned.js";
import { isMeta, Shaper } from "./persona/shape.js";

export interface SpeakOptions {
  llm: Llm;
  profile: Profile;
  system: string;
  history: ChatMessage[];
  cannedLines: readonly string[];
  /** A shaped delta ready for the browser. */
  onToken: (text: string) => void;
  /** The previous attempt streamed something and is being thrown away; the browser clears the bubble. */
  onRestart?: () => void;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
  seed?: number;
}

export interface SpeakResult {
  text: string;
  /** Model id that produced the text, or "canned". */
  source: string;
}

export async function speak(o: SpeakOptions): Promise<SpeakResult> {
  const candidates = [o.profile.model, o.profile.fallback].filter((m): m is string => Boolean(m));
  let emittedAny = false;

  for (const model of candidates) {
    if (emittedAny) {
      o.onRestart?.();
      emittedAny = false;
    }
    const shaper = new Shaper();
    try {
      const stream = o.llm.stream({
        model,
        messages: [{ role: "system", content: o.system }, ...o.history],
        temperature: o.profile.temperature,
        maxOutputTokens: o.profile.maxOutputTokens,
        timeoutMs: o.profile.timeoutMs,
        extraBody: o.profile.extraBody,
        stream: true,
      });
      for await (const delta of stream) {
        const out = shaper.push(delta);
        if (out) {
          emittedAny = true;
          o.onToken(out);
        }
        if (shaper.done) break;
      }
      const tail = shaper.finish();
      if (tail) {
        emittedAny = true;
        o.onToken(tail);
      }
      const text = shaper.text();
      if (!text) {
        o.log?.("empty reply", { model });
        continue;
      }
      if (isMeta(text)) {
        o.log?.("meta reply dropped", { model });
        continue;
      }
      return { text, source: model };
    } catch (err) {
      o.log?.("model call failed", { model, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (emittedAny) o.onRestart?.();
  const line = canned(o.cannedLines, o.seed ?? Date.now());
  o.onToken(line);
  return { text: line, source: "canned" };
}
