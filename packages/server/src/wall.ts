/** The Official Journal of Rejected Startups: officials' lines only, persisted, broadcast over SSE. */
import { EventEmitter } from "node:events";
import type { WallEntry } from "@dg-roast/shared";
import type { Db } from "./db.js";

export class Wall {
  private readonly bus = new EventEmitter();

  constructor(private readonly db: Db) {
    this.bus.setMaxListeners(1000);
  }

  add(entry: WallEntry): void {
    this.db.prepare("INSERT INTO wall (speaker, text, at) VALUES (?, ?, ?)").run(entry.speaker, entry.text, entry.at);
    this.bus.emit("entry", entry);
  }

  recent(n = 30): WallEntry[] {
    const rows = this.db.prepare("SELECT speaker, text, at FROM wall ORDER BY id DESC LIMIT ?").all(n) as unknown as WallEntry[];
    return rows.reverse().map((r) => ({ speaker: r.speaker, text: r.text, at: r.at }));
  }

  subscribe(fn: (e: WallEntry) => void): () => void {
    this.bus.on("entry", fn);
    return () => this.bus.off("entry", fn);
  }
}
