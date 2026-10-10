import type { LeaderboardEntry, Meanwhile, Persona, RoastEvent, RoastEventV2, WallEntry } from "../contract";
import { sleep } from "../dom";
import { readSse, toRoastEvent } from "../sse";
import { toEntry, type BoardSort } from "./board";
import { toMeanwhile } from "./meanwhile";

export type AnyEvent = RoastEvent | RoastEventV2;

/** `GET /api/stats` (requested from server-v2; optional). */
export interface Stats {
  queue: number | null;
  applicantsToday: number | null;
  meanwhileToday: Meanwhile | null;
  refusedToday: number | null;
  totalEurToday: number | null;
  totalJailMonthsToday: number | null;
}

/** `?event=` id of this hackathon (leaderboard + stats filter). */
export const HACK_EVENT = "bcn-hack-24h";
const ev = (event?: string | null) => (event ? `event=${encodeURIComponent(event)}` : "");

/** `GET /api/live` (requested from server-v2; optional): the case the room should watch. */
export interface LiveCase {
  caseId: string;
  ticket: number | null;
  startupName: string | null;
}

export type GameId = "whack" | "swipe" | "flappy" | "triplicate";
export interface GameTop {
  name: string;
  score: number;
}

/** "missing" = the route is not deployed (404/501): the caller hides the feature instead of erroring. */
export type Maybe<T> = T | "missing";

export interface LiveApi {
  readonly mock: boolean;
  personas(): Promise<Persona[]>;
  leaderboard(sort: BoardSort | "recent", limit: number, event?: string | null): Promise<Maybe<LeaderboardEntry[]>>;
  /** Runs until `signal` aborts, reconnecting on drop. */
  leaderboardStream(onEntry: (e: LeaderboardEntry) => void, signal: AbortSignal): Promise<void>;
  wall(onEntry: (e: WallEntry) => void, signal: AbortSignal): Promise<void>;
  stats(event?: string | null): Promise<Maybe<Stats>>;
  live(): Promise<Maybe<LiveCase | null>>;
  /** One round's events; resolves when the server closes the stream. Rejects with status on HTTP errors. */
  caseStream(caseId: string, onEvent: (e: AnyEvent) => void, signal: AbortSignal): Promise<void>;
  gameTop(game: GameId): Promise<Maybe<GameTop | null>>;
}

export class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

const MISSING = new Set([404, 405, 501]);

async function getJson<T>(url: string, signal?: AbortSignal): Promise<Maybe<T | null>> {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal });
  if (MISSING.has(res.status)) return "missing";
  if (res.status === 204) return null;
  if (!res.ok) throw new HttpStatusError(res.status);
  // An SPA fallback serving index.html for an unknown /api route is "missing" too.
  if (!(res.headers.get("content-type") ?? "").includes("json")) return "missing";
  return (await res.json()) as T;
}

const nn = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

export function toStats(raw: unknown): Stats | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return { queue: nn(r.queue), applicantsToday: nn(r.applicantsToday), meanwhileToday: toMeanwhile(r.meanwhileToday), refusedToday: nn(r.refusedToday), totalEurToday: nn(r.totalEurToday), totalJailMonthsToday: nn(r.totalJailMonthsToday) };
}

export function toLive(raw: unknown): LiveCase | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const caseId = typeof r.caseId === "string" && r.caseId ? r.caseId : null;
  if (!caseId) return null;
  return { caseId, ticket: nn(r.ticket), startupName: typeof r.startupName === "string" ? r.startupName : null };
}

/** Accepts `{entries:[…]}`, a bare array, or `{top:…}`; entry name under name/player/nickname. */
export function toGameTop(raw: unknown): GameTop | null {
  const r = raw as Record<string, unknown> | unknown[] | null;
  const list = Array.isArray(r) ? r : Array.isArray(r?.entries) ? (r!.entries as unknown[]) : Array.isArray(r?.scores) ? (r!.scores as unknown[]) : r?.top ? [r.top] : [];
  const best = list
    .map((x) => x as Record<string, unknown>)
    .filter((x) => x && typeof x.score === "number" && Number.isFinite(x.score))
    .sort((a, b) => (b.score as number) - (a.score as number))[0];
  if (!best) return null;
  const name = [best.name, best.player, best.nickname].find((v): v is string => typeof v === "string" && v.trim() !== "") ?? "Anonymous applicant";
  return { name: name.slice(0, 24), score: best.score as number };
}

async function sseLoop(url: string, onData: (data: unknown) => void, signal: AbortSignal): Promise<void> {
  let backoff = 1000;
  while (!signal.aborted) {
    try {
      const res = await fetch(url, { headers: { accept: "text/event-stream" }, signal });
      if (MISSING.has(res.status)) {
        await sleep(30_000);
        continue;
      }
      if (!res.ok) throw new HttpStatusError(res.status);
      backoff = 1000;
      await readSse(res, (m) => {
        try {
          onData(JSON.parse(m.data));
        } catch {
          /* not json */
        }
      });
    } catch {
      if (signal.aborted) return;
    }
    await sleep(backoff);
    backoff = Math.min(backoff * 2, 15_000);
  }
}

export function httpLiveApi(base = ""): LiveApi {
  return {
    mock: false,
    async personas() {
      const r = await getJson<Persona[]>(`${base}/api/personas`);
      return Array.isArray(r) ? r : [];
    },
    async leaderboard(sort, limit, event) {
      const r = await getJson<{ entries?: unknown[] }>(`${base}/api/leaderboard?sort=${sort}&limit=${limit}${event ? `&${ev(event)}` : ""}`);
      if (r === "missing") return r;
      return (r?.entries ?? []).map(toEntry).filter((e): e is LeaderboardEntry => !!e);
    },
    leaderboardStream: (onEntry, signal) =>
      sseLoop(`${base}/api/leaderboard/stream`, (d) => (Array.isArray(d) ? d : [d]).map(toEntry).forEach((e) => e && onEntry(e)), signal),
    wall: (onEntry, signal) =>
      sseLoop(
        `${base}/api/wall/stream`,
        (d) => (Array.isArray(d) ? d : [d]).forEach((e) => e && typeof e.speaker === "string" && typeof e.text === "string" && onEntry(e as WallEntry)),
        signal,
      ),
    async stats(event) {
      const r = await getJson(`${base}/api/stats${event ? `?${ev(event)}` : ""}`);
      return r === "missing" ? r : (toStats(r) ?? "missing");
    },
    async live() {
      const r = await getJson(`${base}/api/live`);
      return r === "missing" ? r : toLive(r);
    },
    async caseStream(caseId, onEvent, signal) {
      const res = await fetch(`${base}/api/case/${encodeURIComponent(caseId)}/stream`, { headers: { accept: "text/event-stream" }, signal });
      if (!res.ok) throw new HttpStatusError(res.status);
      await readSse(res, (m) => {
        const e = toRoastEvent(m);
        if (e) onEvent(e as AnyEvent);
      });
    },
    async gameTop(game) {
      const r = await getJson(`${base}/api/game/leaderboard?game=${game}&limit=5`);
      return r === "missing" ? r : toGameTop(r);
    },
  };
}
