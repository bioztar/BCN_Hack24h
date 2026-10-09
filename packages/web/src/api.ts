import type { Case, Persona, PersonaId, RoastEvent, Submission, WallEntry } from "./contract";
import { readSse, toRoastEvent, toWallEntry } from "./sse";
import { sleep } from "./dom";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** `GET /api/pairs` (CONTRACT.md, v1.3). Not in packages/shared yet. */
export interface Pair {
  id: string;
  officers: [PersonaId, PersonaId];
}

/** PERSONA.md "The pairs" — fallback when /api/pairs is unreachable. */
export const FIXED_PAIRS: Pair[] = [
  { id: "commission", officers: ["formblatt", "annexe"] },
  { id: "basement", officers: ["grandma-gdpr", "auditor-9000"] },
  { id: "raid", officers: ["de-vries", "the-cookie"] },
];

const PAIR_NAMES: Record<string, string> = {
  commission: "The Commission",
  basement: "The Basement",
  raid: "The Raid",
};

export function pairName(id: string): string {
  return PAIR_NAMES[id] ?? id.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface Api {
  readonly mock: boolean;
  personas(): Promise<Persona[]>;
  pairs(): Promise<Pair[]>;
  createCase(submission: Submission, officers?: [PersonaId, PersonaId]): Promise<Case>;
  /** One round of events; resolves when the server closes the stream. */
  stream(caseId: string, onEvent: (e: RoastEvent) => void, signal?: AbortSignal): Promise<void>;
  reply(caseId: string, text: string): Promise<void>;
  stt(audio: Blob): Promise<string>;
  /** Runs until `signal` aborts, reconnecting on drop. */
  wall(onEntry: (e: WallEntry) => void, signal: AbortSignal): Promise<void>;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      /* not json */
    }
    throw new ApiError(msg, res.status);
  }
  return (await res.json()) as T;
}

export function httpApi(base = ""): Api {
  return {
    mock: false,
    personas: async () => json<Persona[]>(await fetch(`${base}/api/personas`)),
    pairs: async () => json<Pair[]>(await fetch(`${base}/api/pairs`)),
    createCase: async (submission, officers) =>
      json<Case>(
        await fetch(`${base}/api/case`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(officers ? { submission, officers } : { submission }),
        }),
      ),
    async stream(caseId, onEvent, signal) {
      const res = await fetch(`${base}/api/case/${encodeURIComponent(caseId)}/stream`, {
        headers: { accept: "text/event-stream" },
        signal,
      });
      if (!res.ok) await json(res);
      await readSse(res, (m) => {
        const e = toRoastEvent(m);
        if (e) onEvent(e);
      });
    },
    async reply(caseId, text) {
      const res = await fetch(`${base}/api/case/${encodeURIComponent(caseId)}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) await json(res);
    },
    async stt(audio) {
      const res = await fetch(`${base}/api/stt`, {
        method: "POST",
        headers: { "content-type": audio.type || "audio/webm" },
        body: audio,
      });
      return (await json<{ text: string }>(res)).text ?? "";
    },
    async wall(onEntry, signal) {
      let backoff = 1000;
      while (!signal.aborted) {
        try {
          const res = await fetch(`${base}/api/wall/stream`, { headers: { accept: "text/event-stream" }, signal });
          if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
          backoff = 1000;
          await readSse(res, (m) => toWallEntry(m).forEach(onEntry));
        } catch {
          if (signal.aborted) return;
        }
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 15_000);
      }
    },
  };
}
