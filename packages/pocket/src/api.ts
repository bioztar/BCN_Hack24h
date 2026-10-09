import { FIXTURE_PAIRS, FIXTURE_PERSONAS, MOCK_DICTATION, mockRoundSse } from "./fixtures";
import { SseParser, toRoastEvent } from "./sse";
import type { Case, Pair, Persona, PersonaId, RoastEvent, Submission } from "./types";

export interface Api {
  readonly mock: boolean;
  personas(): Promise<Persona[]>;
  pairs(): Promise<Pair[]>;
  createCase(submission: Submission, officers: [PersonaId, PersonaId]): Promise<Case>;
  stream(caseId: string, onEvent: (e: RoastEvent) => void, signal: AbortSignal): Promise<void>;
  reply(caseId: string, text: string): Promise<void>;
  stt(audio: Blob): Promise<string>;
}

const BASE = "/api";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch { /* not JSON */ }
    throw new Error(res.status === 429 ? "The Commission is overwhelmed (429). Please queue." : msg);
  }
  return (await res.json()) as T;
}

/** Reads an SSE body chunk by chunk (fetch, not EventSource: no auto-reconnect replaying a round). */
export async function pumpSse(body: ReadableStream<Uint8Array>, onEvent: (e: RoastEvent) => void): Promise<void> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  const parser = new SseParser();
  const emit = (msgs: ReturnType<SseParser["push"]>) => {
    for (const m of msgs) {
      const e = toRoastEvent(m);
      if (e) onEvent(e);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    emit(parser.push(dec.decode(value, { stream: true })));
  }
  emit(parser.end());
}

export class LiveApi implements Api {
  readonly mock = false;
  async personas(): Promise<Persona[]> {
    try {
      const list = await json<Persona[]>(await fetch(`${BASE}/personas`));
      return Array.isArray(list) && list.length ? list : FIXTURE_PERSONAS;
    } catch {
      return FIXTURE_PERSONAS;
    }
  }
  async pairs(): Promise<Pair[]> {
    try {
      const list = await json<Pair[]>(await fetch(`${BASE}/pairs`));
      return Array.isArray(list) && list.length ? list : FIXTURE_PAIRS;
    } catch {
      return FIXTURE_PAIRS;
    }
  }
  async createCase(submission: Submission, officers: [PersonaId, PersonaId]): Promise<Case> {
    return json<Case>(await fetch(`${BASE}/case`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ submission, officers }) }));
  }
  async stream(caseId: string, onEvent: (e: RoastEvent) => void, signal: AbortSignal): Promise<void> {
    const res = await fetch(`${BASE}/case/${encodeURIComponent(caseId)}/stream`, { headers: { accept: "text/event-stream" }, signal });
    if (!res.ok || !res.body) await json(res);
    await pumpSse(res.body!, onEvent);
  }
  async reply(caseId: string, text: string): Promise<void> {
    const res = await fetch(`${BASE}/case/${encodeURIComponent(caseId)}/reply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    if (!res.ok) await json(res);
  }
  async stt(audio: Blob): Promise<string> {
    const type = audio.type || "audio/webm";
    const res = await fetch(`${BASE}/stt`, { method: "POST", headers: { "content-type": type }, body: audio });
    return (await json<{ text: string }>(res)).text;
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    });
  });

/** ?mock=1 — the fixture roast, streamed through the same SSE parser as the real server. */
export class MockApi implements Api {
  readonly mock = true;
  private cases = new Map<string, { personas: [Persona, Persona]; ticket: number; pitch: string; revenueEur?: number; round: number; serial: string }>();
  async personas() { return FIXTURE_PERSONAS; }
  async pairs() { return FIXTURE_PAIRS; }
  async createCase(submission: Submission, officers: [PersonaId, PersonaId]): Promise<Case> {
    await sleep(350);
    const caseId = `mock-${Date.now().toString(36)}`;
    const ticket = 4812 + Math.floor(Math.random() * 900);
    const find = (id: PersonaId) => FIXTURE_PERSONAS.find((p) => p.id === id) ?? FIXTURE_PERSONAS[0]!;
    this.cases.set(caseId, { personas: [find(officers[0]), find(officers[1])], ticket, pitch: submission.text ?? "", revenueEur: submission.revenueEur, round: 0, serial: `L-2026/${String(ticket).padStart(5, "0")}` });
    return { caseId, ticket, officers };
  }
  async stream(caseId: string, onEvent: (e: RoastEvent) => void, signal: AbortSignal): Promise<void> {
    const c = this.cases.get(caseId);
    if (!c) throw new Error("no such case");
    const text = mockRoundSse(c, c.round);
    const enc = new TextEncoder();
    const blocks = text.split(/(?<=\n\n)/);
    const body = new ReadableStream<Uint8Array>({
      async start(ctrl) {
        try {
          for (const b of blocks) {
            const isLine = b.includes('"type":"line"');
            await sleep(isLine ? 450 : 150, signal);
            ctrl.enqueue(enc.encode(b));
          }
          ctrl.close();
        } catch (e) {
          ctrl.error(e);
        }
      },
    });
    await pumpSse(body, onEvent);
  }
  async reply(caseId: string): Promise<void> {
    const c = this.cases.get(caseId);
    if (c) c.round++;
    await sleep(200);
  }
  async stt(): Promise<string> {
    await sleep(600);
    return MOCK_DICTATION;
  }
}
