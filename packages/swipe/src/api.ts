export const GAME = "swipe";
const LOCAL_KEY = "eurocrat.swipe.leaderboard.v1";

export interface Session {
  seed: string;
  token: string | null;
  mode: "server" | "local";
}

export interface Entry {
  name: string;
  score: number;
}

export interface ScorePayload {
  name: string;
  score: number;
  durationMs: number;
  stats: Record<string, number | string>;
}

type Fetch = typeof fetch;
type Store = Pick<Storage, "getItem" | "setItem">;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function randomSeed(): string {
  return Math.floor(Math.random() * 2 ** 32).toString(36);
}

async function timed(fetchFn: Fetch, url: string, init: RequestInit = {}, ms = 3000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetchFn(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function startSession(mock: boolean, fetchFn: Fetch = fetch): Promise<Session> {
  if (!mock) {
    try {
      const res = await timed(fetchFn, `/api/game/start?game=${GAME}`);
      if (res.ok) {
        const j = (await res.json()) as { seed?: unknown; token?: unknown };
        if (j.seed !== undefined && j.seed !== null) {
          return { seed: String(j.seed), token: typeof j.token === "string" ? j.token : null, mode: "server" };
        }
      }
    } catch (err) {
      console.warn("[swipe] leaderboard start unavailable:", (err as Error).name);
    }
  }
  return { seed: randomSeed(), token: null, mode: "local" };
}

export function parseEntries(j: unknown): Entry[] {
  const o = j as Record<string, unknown> | null;
  const list = Array.isArray(j)
    ? j
    : ([o?.entries, o?.leaderboard, o?.scores, o?.top, o?.items].find(Array.isArray) as unknown[] | undefined) ?? [];
  return list
    .map((e) => e as Record<string, unknown>)
    .filter((e) => e && typeof e.score === "number")
    .map((e) => ({ name: String(e.name ?? e.player ?? "Anonymous").slice(0, 24), score: e.score as number }));
}

export class LocalBoard {
  constructor(private store: Store | null) {}

  private read(): (Entry & { day: string })[] {
    try {
      const raw = this.store?.getItem(LOCAL_KEY);
      const xs = raw ? (JSON.parse(raw) as (Entry & { day: string })[]) : [];
      return Array.isArray(xs) ? xs.filter((e) => e.day === today()) : [];
    } catch {
      return [];
    }
  }

  top(limit = 10): Entry[] {
    return this.read()
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ name, score }) => ({ name, score }));
  }

  add(e: Entry): number {
    const xs = [...this.read(), { ...e, day: today() }].sort((a, b) => b.score - a.score).slice(0, 50);
    try {
      this.store?.setItem(LOCAL_KEY, JSON.stringify(xs));
    } catch {
      /* private mode: rank still computed */
    }
    const rank = xs.findIndex((x) => x.score <= e.score) + 1;
    return rank > 0 ? rank : xs.length;
  }
}

export class Leaderboard {
  private local: LocalBoard;

  constructor(
    private session: Session,
    store: Store | null,
    private fetchFn: Fetch = fetch,
  ) {
    this.local = new LocalBoard(store);
  }

  get mode(): Session["mode"] {
    return this.session.mode;
  }

  async submit(p: ScorePayload): Promise<{ rank: number; mode: Session["mode"] }> {
    const name = p.name.trim().slice(0, 24) || "Anonymous applicant";
    if (this.session.mode === "server") {
      try {
        const res = await timed(this.fetchFn, "/api/game/score", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            game: GAME,
            name,
            score: p.score,
            durationMs: p.durationMs,
            seed: this.session.seed,
            token: this.session.token,
            stats: p.stats,
          }),
        });
        if (res.ok) {
          const j = (await res.json()) as { rank?: unknown };
          if (typeof j.rank === "number") return { rank: j.rank, mode: "server" };
        }
        console.warn("[swipe] score rejected:", res.status);
      } catch (err) {
        console.warn("[swipe] score submit failed:", (err as Error).name);
      }
      this.session = { ...this.session, mode: "local" };
    }
    return { rank: this.local.add({ name, score: p.score }), mode: "local" };
  }

  async top(limit = 10): Promise<Entry[]> {
    if (this.session.mode === "server") {
      try {
        const res = await timed(this.fetchFn, `/api/game/leaderboard?game=${GAME}&limit=${limit}`);
        if (res.ok) return parseEntries(await res.json()).slice(0, limit);
      } catch (err) {
        console.warn("[swipe] leaderboard unavailable:", (err as Error).name);
      }
    }
    return this.local.top(limit);
  }
}
