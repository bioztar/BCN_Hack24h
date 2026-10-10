import type { LeaderboardEntry, Meanwhile, Persona } from "../contract";
import { sleep } from "../dom";
import { LateAudio, makeLinePlayer, readingTimeMs, Sequencer } from "../sequencer";
import { speak, unlockAudio } from "../stage/sfx";
import { pushCaption, sameDay, toEntry, upsert, type Caption } from "../live/board";
import { emptyLive, liveReduce, type LiveState } from "../live/case";
import { dayMeanwhile } from "../live/meanwhile";
import { HttpStatusError, type AnyEvent, type LiveApi, type Stats } from "../live/api";

/** How long the stage stays on a case that sits in "awaiting" before following a newer one. */
const AWAIT_SWITCH_MS = 45_000;
const LATE_AUDIO_MS = 3000;

/**
 * Everything the presenter views show, fed by the server (or the mock world): leaderboard,
 * captions for the ticker, queue stats, and the live-case mirror. Views subscribe and re-render.
 */
export class Hub {
  entries: LeaderboardEntry[] = [];
  captions: Caption[] = [];
  personas: Persona[] = [];
  stats: Stats | null = null;
  statsMissing = false;
  live: LiveState = emptyLive();
  /** Lines play their audio on the stage (off by default in live mode: the phone has the sound). */
  sound: boolean;
  pinned: string | null;
  speaking = false;
  /** caseIds that arrived on the leaderboard stream after start (for the "new" flash). */
  readonly fresh = new Set<string>();

  private readonly subs = new Set<(what: Change) => void>();
  private readonly ac = new AbortController();
  private readonly seq = new Sequencer<{ caseId: string; e: AnyEvent }>((j, cur) => this.apply(j, cur));
  private readonly late = new LateAudio();
  private awaitingSince = 0;
  private lineEnd: (() => void) | null = null;
  private readonly playLine = makeLinePlayer({
    createAudio: (url) => new Audio(url),
    sleep: (ms) => this.hold(ms),
    speak: (text, speaker) => (this.api.mock ? speak(text, speaker) : null),
  });

  constructor(
    private readonly api: LiveApi,
    opts: { sound?: boolean; pinCase?: string | null } = {},
  ) {
    this.sound = opts.sound ?? false;
    this.pinned = opts.pinCase ?? null;
  }

  on(fn: (what: Change) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  private emit(what: Change) {
    this.subs.forEach((f) => f(what));
  }

  start(): void {
    void this.api.personas().then((p) => ((this.personas = p), this.emit("live"))).catch(() => undefined);
    void this.loadBoard();
    void this.api.leaderboardStream((e) => this.addEntry(e, true), this.ac.signal);
    void this.api.wall((w) => this.addCaption(w.text), this.ac.signal).catch(() => undefined);
    void this.pollStats();
    void this.followLive();
  }

  stop(): void {
    this.ac.abort();
    this.seq.clear();
  }

  toggleSound(): void {
    this.sound = !this.sound;
    if (this.sound) unlockAudio();
    else {
      speechSynthesis?.cancel?.();
      this.lineEnd?.();
    }
    this.emit("live");
  }

  togglePin(): void {
    this.pinned = this.pinned ? null : this.live.caseId;
    this.emit("live");
  }

  /** Queue counter: server queue if known; null → the view falls back to `refusedToday`. */
  get queue(): number | null {
    return this.stats?.queue ?? null;
  }

  get refusedToday(): number {
    const now = new Date();
    return this.entries.filter((e) => sameDay(e.issuedAt, now)).length;
  }

  /** Day-total Meanwhile; `estimated` when the server has no aggregate. */
  dayMeanwhile(): { m: Meanwhile; estimated: boolean } {
    const s = this.stats?.meanwhileToday;
    return s ? { m: s, estimated: false } : { m: dayMeanwhile(new Date()), estimated: true };
  }

  private async loadBoard() {
    for (let attempt = 0; attempt < 5 && !this.ac.signal.aborted; attempt++) {
      try {
        const [fines, jail] = await Promise.all([this.api.leaderboard("fines", 50), this.api.leaderboard("jail", 50)]);
        for (const list of [fines, jail]) if (list !== "missing") list.forEach((e) => this.addEntry(e, false));
        return;
      } catch (err) {
        console.warn("[presenter] leaderboard", err);
        await sleep(3000);
      }
    }
  }

  addEntry(raw: LeaderboardEntry, live: boolean): void {
    const e = toEntry(raw);
    if (!e) return;
    const isNew = !this.entries.some((x) => x.caseId === e.caseId);
    this.entries = upsert(this.entries, e);
    if (live && isNew) this.fresh.add(e.caseId);
    this.emit("board");
  }

  addCaption(text: string): void {
    const next = pushCaption(this.captions, text, Date.now());
    if (next !== this.captions) {
      this.captions = next;
      this.emit("ticker");
    }
  }

  private async pollStats() {
    while (!this.ac.signal.aborted) {
      try {
        const s = await this.api.stats();
        this.statsMissing = s === "missing";
        this.stats = s === "missing" ? null : s;
        this.emit("stats");
      } catch {
        /* keep the last value */
      }
      await sleep(this.statsMissing ? 30_000 : 4000);
    }
  }

  /** Which case to show: `?case=` pin → `GET /api/live` → newest leaderboard entry. */
  private async target(): Promise<{ caseId: string; ticket: number | null; startupName: string | null } | null> {
    if (this.pinned) return { caseId: this.pinned, ticket: null, startupName: null };
    try {
      const l = await this.api.live();
      if (l !== "missing") return l;
    } catch {
      /* fall through */
    }
    const recent = this.entries.slice().sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1))[0];
    return recent ? { caseId: recent.caseId, ticket: null, startupName: recent.startupName } : null;
  }

  private switchable(): boolean {
    if (this.pinned) return false;
    if (!this.live.caseId || this.live.notice || this.live.error) return true;
    return !!this.live.awaiting && Date.now() - this.awaitingSince > AWAIT_SWITCH_MS;
  }

  private async followLive() {
    while (!this.ac.signal.aborted) {
      const t = await this.target();
      if (t && t.caseId !== this.live.caseId && (this.switchable() || this.pinned === t.caseId)) {
        this.seq.clear();
        this.lineEnd?.();
        this.live = emptyLive(t.caseId, t.ticket, t.startupName);
        this.emit("live");
      }
      const id = this.live.caseId;
      if (id && !this.live.notice) {
        try {
          await this.api.caseStream(id, (e) => this.seq.enqueue({ caseId: id, e }), this.ac.signal);
        } catch (err) {
          if (err instanceof HttpStatusError && err.status === 404 && this.live.caseId === id) {
            this.live = { ...this.live, error: "File not found. It has been lost, as is customary." };
            this.emit("live");
          }
        }
      }
      await sleep(this.live.notice || !id ? 3000 : 2000);
    }
  }

  private hold(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(done, ms);
      const self = this;
      function done() {
        clearTimeout(t);
        if (self.lineEnd === done) self.lineEnd = null;
        resolve();
      }
      this.lineEnd = done;
    });
  }

  private async apply(j: { caseId: string; e: AnyEvent }, isCurrent: () => boolean): Promise<void> {
    if (j.caseId !== this.live.caseId || !isCurrent()) return;
    const e = j.e;
    if (e.type === "audio") this.late.deliver(e.id, e.audioUrl);
    const repeat = (e.type === "line" && this.live.seen.includes(e.id)) || (e.type === "fine" && this.live.meter.fines.some((f) => f.id === e.id));
    const was = this.live;
    this.live = liveReduce(this.live, e);
    if (this.live.awaiting && !was.awaiting) this.awaitingSince = Date.now();
    if (repeat || this.live === was) return;
    if (e.type === "fine") this.addCaption(e.caption);
    this.emit("live");
    if (e.type !== "line") return;
    this.addCaption(e.text);
    // joined late / replay: catch up quickly instead of reading the whole backlog aloud
    if (this.seq.size > 4) return void (await sleep(250));
    this.speaking = true;
    this.emit("live");
    try {
      if (this.sound) {
        const audioUrl = e.audioUrl ?? (await this.late.wait(e.id, LATE_AUDIO_MS, sleep));
        await this.playLine({ text: e.text, audioUrl, speaker: e.speaker });
      } else await this.hold(readingTimeMs(e.text));
    } finally {
      this.speaking = false;
      this.emit("live");
    }
  }
}

export type Change = "board" | "ticker" | "stats" | "live";
