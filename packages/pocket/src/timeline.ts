import type { LineEvent } from "./reducer";
import type { FineEvent } from "./types";

export interface Cue { line: LineEvent; fines: FineEvent[]; }

/**
 * The roast's playback queue. A `fine` lands on the meter while the line that cites its
 * provision is spoken; if no unplayed line cites it, it lands immediately.
 */
export class Timeline {
  readonly cues: Cue[] = [];
  played = 0;
  private seen = new Set<string>();

  addLine(line: LineEvent): void {
    if (this.seen.has(line.id)) return;
    this.seen.add(line.id);
    this.cues.push({ line, fines: [] });
  }

  /** Returns the fine if it should be applied now, null if it was attached to an upcoming line. */
  addFine(f: FineEvent): FineEvent | null {
    for (let i = this.played; i < this.cues.length; i++) {
      const c = this.cues[i]!;
      if (c.line.provisions.some((p) => p.id === f.provision.id) && !c.fines.some((x) => x.provision.id === f.provision.id)) {
        c.fines.push(f);
        return null;
      }
    }
    return f;
  }

  next(): Cue | undefined {
    return this.played < this.cues.length ? this.cues[this.played++] : undefined;
  }

  get pending(): boolean {
    return this.played < this.cues.length;
  }

  clear(): void {
    this.cues.length = 0;
    this.played = 0;
    this.seen.clear();
  }
}

/** Meter totals actually shown + the deferred meltdown: it fires once the shown totals reach it. */
export class FineSync {
  eur = 0;
  jail = 0;
  melted = false;
  private pendingMeltdown: { totalEur: number; totalJailMonths: number } | null = null;

  /** Apply a fine; true if this tips a pending meltdown. */
  apply(f: FineEvent): boolean {
    this.eur = Math.max(this.eur, f.totalEur);
    this.jail = Math.max(this.jail, f.totalJailMonths);
    return this.check();
  }

  /** Server said meltdown; true if the meter already shows enough to burn now. */
  meltdown(e: { totalEur: number; totalJailMonths: number }): boolean {
    if (this.melted) return false;
    this.pendingMeltdown = e;
    return this.check();
  }

  /** End of round / verdict: burn anything still pending. */
  flush(): boolean {
    if (this.melted || !this.pendingMeltdown) return false;
    this.eur = Math.max(this.eur, this.pendingMeltdown.totalEur);
    this.jail = Math.max(this.jail, this.pendingMeltdown.totalJailMonths);
    this.melted = true;
    this.pendingMeltdown = null;
    return true;
  }

  private check(): boolean {
    const m = this.pendingMeltdown;
    if (this.melted || !m) return false;
    if (this.eur >= m.totalEur && this.jail >= m.totalJailMonths) {
      this.melted = true;
      this.pendingMeltdown = null;
      return true;
    }
    return false;
  }

  reset(): void {
    this.eur = this.jail = 0;
    this.melted = false;
    this.pendingMeltdown = null;
  }
}
