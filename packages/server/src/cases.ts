/** Case state: hot in memory, persisted as JSON in SQLite after every change. */
import type { Db } from "./db.js";
import type { CaseState } from "./engine.js";

export class CaseStore {
  private readonly hot = new Map<string, CaseState>();

  constructor(private readonly db: Db) {}

  get(id: string): CaseState | undefined {
    const hit = this.hot.get(id);
    if (hit) return hit;
    const row = this.db.prepare("SELECT state FROM cases WHERE case_id = ?").get(id) as { state: string } | undefined;
    if (!row) return undefined;
    const state = JSON.parse(row.state) as CaseState;
    this.hot.set(id, state);
    return state;
  }

  save(state: CaseState): void {
    this.hot.set(state.caseId, state);
    if (this.hot.size > 2000) this.hot.delete(this.hot.keys().next().value as string);
    this.db
      .prepare("INSERT INTO cases (case_id, ticket, state, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(case_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at")
      .run(state.caseId, state.ticket, JSON.stringify(state), Date.now());
  }
}
