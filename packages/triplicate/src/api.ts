/** Shared arcade leaderboard (Lane G's gamePlugin) with a local-only fallback for ?mock=1 / 404. */
export const GAME_ID = "triplicate";

export interface BoardEntry {
  name: string;
  score: number;
}

export interface Session {
  seed: string;
  token: string | null;
  online: boolean;
}

export interface SubmitResult {
  rank: number | null;
  online: boolean;
}

const LOCAL_KEY = "triplicate.local-board";
const today = () => new Date().toISOString().slice(0, 10);

const localSeed = () => `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function readLocal(): BoardEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "null") as { day: string; entries: BoardEntry[] } | null;
    return raw && raw.day === today() ? raw.entries : [];
  } catch {
    return [];
  }
}

function writeLocal(entries: BoardEntry[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify({ day: today(), entries: entries.slice(0, 50) }));
}

export function parseBoard(json: unknown): BoardEntry[] {
  const obj = json as Record<string, unknown> | null;
  const list = Array.isArray(json) ? json : (obj?.entries ?? obj?.leaderboard ?? obj?.scores ?? obj?.top ?? []);
  if (!Array.isArray(list)) return [];
  return list
    .map((e) => ({ name: String((e as BoardEntry).name ?? "Anonymous"), score: Number((e as BoardEntry).score) }))
    .filter((e) => Number.isFinite(e.score));
}

export function insertLocal(entries: BoardEntry[], entry: BoardEntry): { entries: BoardEntry[]; rank: number } {
  const next = [...entries, entry].sort((a, b) => b.score - a.score);
  return { entries: next, rank: next.indexOf(entry) + 1 };
}

export class Leaderboard {
  private online: boolean;
  constructor(mock: boolean) {
    this.online = !mock;
  }

  async start(): Promise<Session> {
    if (this.online) {
      try {
        const r = await fetch(`/api/game/start?game=${GAME_ID}`, { cache: "no-store" });
        if (r.ok) {
          const j = (await r.json()) as { seed?: unknown; token?: unknown };
          if (j.seed !== undefined) return { seed: String(j.seed), token: j.token ? String(j.token) : null, online: true };
        }
      } catch { /* fall through */ }
      this.online = false;
    }
    return { seed: localSeed(), token: null, online: false };
  }

  async submit(
    s: Session,
    body: { name: string; score: number; durationMs: number; stats: Record<string, number> },
  ): Promise<SubmitResult> {
    if (s.online && s.token) {
      try {
        const r = await fetch("/api/game/score", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ game: GAME_ID, ...body, seed: s.seed, token: s.token }),
        });
        if (r.ok) {
          const j = (await r.json()) as { rank?: unknown };
          return { rank: typeof j.rank === "number" ? j.rank : null, online: true };
        }
      } catch { /* fall through */ }
    }
    const { entries, rank } = insertLocal(readLocal(), { name: body.name, score: body.score });
    writeLocal(entries);
    return { rank, online: false };
  }

  async top(limit = 10): Promise<{ entries: BoardEntry[]; online: boolean }> {
    if (this.online) {
      try {
        const r = await fetch(`/api/game/leaderboard?game=${GAME_ID}&limit=${limit}`, { cache: "no-store" });
        if (r.ok) return { entries: parseBoard(await r.json()).slice(0, limit), online: true };
      } catch { /* fall through */ }
      this.online = false;
    }
    return { entries: readLocal().slice(0, limit), online: false };
  }
}
