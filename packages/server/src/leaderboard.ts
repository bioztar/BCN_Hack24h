/** The public leaderboard (CONTRACT v2): one row per verdict, keyset-paginated, broadcast over SSE. */
import { EventEmitter } from "node:events";
import type { LeaderboardEntry, LeaderboardSort, Notice } from "@dg-roast/shared";
import type { Db } from "./db.js";

export const SORTS: readonly LeaderboardSort[] = ["fines", "jail", "recent"];

interface Row {
  case_id: string;
  startup_name: string;
  founder_name: string | null;
  one_liner: string | null;
  photo_url: string | null;
  total_eur: number;
  total_jail: number;
  meltdown: number;
  top_laws: string;
  findings: string;
  issued_at: string;
}

const toEntry = (r: Row): LeaderboardEntry => ({
  caseId: r.case_id,
  startupName: r.startup_name,
  founderName: r.founder_name,
  oneLiner: r.one_liner,
  photoUrl: r.photo_url,
  totalEur: Number(r.total_eur),
  totalJailMonths: Number(r.total_jail),
  meltdown: r.meltdown === 1,
  topLaws: JSON.parse(r.top_laws) as string[],
  issuedAt: r.issued_at,
});

/** Sort key column per sort; ties break on issued_at then case_id (both descending). */
const KEY: Record<LeaderboardSort, string | null> = { fines: "total_eur", jail: "total_jail", recent: null };

interface Cursor {
  v: number | null;
  t: string;
  c: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeCursor(s: string): Cursor | null {
  try {
    const c = JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as Cursor;
    return typeof c.t === "string" && typeof c.c === "string" && (c.v === null || typeof c.v === "number") ? c : null;
  } catch {
    return null;
  }
}

export class Leaderboard {
  private readonly bus = new EventEmitter();

  constructor(private readonly db: Db) {
    this.bus.setMaxListeners(1000);
  }

  add(entry: LeaderboardEntry, findings: Notice["findings"], applicantId: string | null): void {
    this.db
      .prepare(
        `INSERT INTO leaderboard (case_id, applicant_id, startup_name, founder_name, one_liner, photo_url, total_eur, total_jail, meltdown, top_laws, findings, issued_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(case_id) DO NOTHING`,
      )
      .run(entry.caseId, applicantId, entry.startupName, entry.founderName, entry.oneLiner, entry.photoUrl, Math.round(entry.totalEur), entry.totalJailMonths, entry.meltdown ? 1 : 0, JSON.stringify(entry.topLaws), JSON.stringify(findings), entry.issuedAt);
    this.bus.emit("entry", entry);
  }

  list(sort: LeaderboardSort = "fines", limit = 50, cursor?: string | null): { entries: LeaderboardEntry[]; next: string | null } {
    const n = Math.min(200, Math.max(1, Math.floor(limit) || 50));
    const key = KEY[sort];
    const c = cursor ? decodeCursor(cursor) : null;
    const order = key ? `${key} DESC, issued_at DESC, case_id DESC` : "issued_at DESC, case_id DESC";
    let where = "";
    const args: (string | number)[] = [];
    if (c) {
      if (key) {
        where = `WHERE (${key} < ? OR (${key} = ? AND (issued_at < ? OR (issued_at = ? AND case_id < ?))))`;
        args.push(c.v ?? 0, c.v ?? 0, c.t, c.t, c.c);
      } else {
        where = "WHERE (issued_at < ? OR (issued_at = ? AND case_id < ?))";
        args.push(c.t, c.t, c.c);
      }
    }
    const rows = this.db.prepare(`SELECT * FROM leaderboard ${where} ORDER BY ${order} LIMIT ?`).all(...args, n + 1) as unknown as Row[];
    const page = rows.slice(0, n);
    const last = page.at(-1);
    const next = rows.length > n && last ? encodeCursor({ v: key ? Number(last[key as "total_eur" | "total_jail"]) : null, t: last.issued_at, c: last.case_id }) : null;
    return { entries: page.map(toEntry), next };
  }

  get(caseId: string): { entry: LeaderboardEntry; findings: Notice["findings"] } | null {
    const row = this.db.prepare("SELECT * FROM leaderboard WHERE case_id = ?").get(caseId) as Row | undefined;
    return row ? { entry: toEntry(row), findings: JSON.parse(row.findings) as Notice["findings"] } : null;
  }

  subscribe(fn: (e: LeaderboardEntry) => void): () => void {
    this.bus.on("entry", fn);
    return () => this.bus.off("entry", fn);
  }
}
