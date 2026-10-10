import { drawBadge } from "./badge";
import { FIXTURE_PAIRS, FIXTURE_PERSONAS, MOCK_DICTATION, mockRoundEvents, type MockTotals } from "./fixtures";
import { mergeEntries } from "./leaderboard";
import { estimateMeanwhile } from "./meanwhile";
import { mockLeaderboard, mockNewEntry, mockQuip, mockTicket } from "./mockdata";
import { buildReportPdf } from "./pdf";
import { SseParser, toRoastEvent } from "./sse";
import type {
  ApplicantAuth,
  AnyRoastEvent, ApplicantInput, BetterPlaceCause, BetterPlaceResult, Case, LeaderboardDetail, LeaderboardEntry, LeaderboardSort,
  NoticeV2, Pair, Persona, PersonaId, QueueTicket, Submission,
} from "./types";

export interface Api {
  readonly mock: boolean;
  personas(): Promise<Persona[]>;
  pairs(): Promise<Pair[]>;
  /** One case per applicant: a second call with the same applicant returns the existing caseId. */
  createCase(submission: Submission, officers?: [PersonaId, PersonaId], applicant?: ApplicantAuth): Promise<Case>;
  stream(caseId: string, onEvent: (e: AnyRoastEvent) => void, signal: AbortSignal): Promise<void>;
  reply(caseId: string, text: string): Promise<void>;
  stt(audio: Blob): Promise<string>;
  // v2
  register(input: ApplicantInput): Promise<QueueTicket>;
  betterPlace(applicant: ApplicantAuth, cause: BetterPlaceCause): Promise<BetterPlaceResult>;
  leaderboard(sort: LeaderboardSort, limit?: number): Promise<LeaderboardEntry[]>;
  /** Live entries (on connect: top 20 by fines). Returns an unsubscribe. */
  leaderboardStream(onEntry: (e: LeaderboardEntry) => void): () => void;
  leaderboardEntry(caseId: string): Promise<LeaderboardDetail>;
}

const BASE = "/api";

export class HttpError extends Error {
  constructor(readonly status: number, msg: string) {
    super(msg);
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch { /* not JSON */ }
    throw new HttpError(res.status, res.status === 429 ? "The Commission is overwhelmed (429). Please queue." : msg);
  }
  return (await res.json()) as T;
}

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const tokenHeader = (a?: ApplicantAuth): Record<string, string> => (a?.applicantToken ? { "x-applicant-token": a.applicantToken } : {});

/** Reads an SSE body chunk by chunk (fetch, not EventSource: no auto-reconnect replaying a round). */
export async function pumpSse(body: ReadableStream<Uint8Array>, onEvent: (e: AnyRoastEvent) => void): Promise<void> {
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

function isEntry(x: unknown): x is LeaderboardEntry {
  return !!x && typeof x === "object" && typeof (x as LeaderboardEntry).caseId === "string" && typeof (x as LeaderboardEntry).totalEur === "number";
}

/** Accepts `LeaderboardEntry`, `{entry}`, `{type, entry}` or `{entries: []}` SSE payloads. */
export function entriesFromMessage(data: string): LeaderboardEntry[] {
  let o: unknown;
  try {
    o = JSON.parse(data);
  } catch {
    return [];
  }
  if (isEntry(o)) return [o];
  const r = o as { entry?: unknown; entries?: unknown };
  if (isEntry(r?.entry)) return [r.entry];
  if (Array.isArray(r?.entries)) return r.entries.filter(isEntry);
  if (Array.isArray(o)) return o.filter(isEntry);
  return [];
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
  async createCase(submission: Submission, officers?: [PersonaId, PersonaId], applicant?: ApplicantAuth): Promise<Case> {
    const auth = applicant ? { applicantId: applicant.applicantId, applicantToken: applicant.applicantToken } : {};
    return json<Case>(await post("/case", { submission, ...(officers ? { officers } : {}), ...auth }, tokenHeader(applicant)));
  }
  async stream(caseId: string, onEvent: (e: AnyRoastEvent) => void, signal: AbortSignal): Promise<void> {
    const res = await fetch(`${BASE}/case/${encodeURIComponent(caseId)}/stream`, { headers: { accept: "text/event-stream" }, signal });
    if (!res.ok || !res.body) await json(res);
    await pumpSse(res.body!, onEvent);
  }
  async reply(caseId: string, text: string): Promise<void> {
    const res = await post(`/case/${encodeURIComponent(caseId)}/reply`, { text });
    if (!res.ok) await json(res);
  }
  async stt(audio: Blob): Promise<string> {
    const type = audio.type || "audio/webm";
    const res = await fetch(`${BASE}/stt`, { method: "POST", headers: { "content-type": type }, body: audio });
    return (await json<{ text: string }>(res)).text;
  }
  async register(input: ApplicantInput): Promise<QueueTicket> {
    return json<QueueTicket>(await post("/applicants", input));
  }
  async betterPlace(a: ApplicantAuth, cause: BetterPlaceCause): Promise<BetterPlaceResult> {
    return json<BetterPlaceResult>(await post(`/applicants/${encodeURIComponent(a.applicantId)}/better-place`, { cause, applicantToken: a.applicantToken }, tokenHeader(a)));
  }
  async leaderboard(sort: LeaderboardSort, limit = 50): Promise<LeaderboardEntry[]> {
    const r = await json<{ entries: LeaderboardEntry[] }>(await fetch(`${BASE}/leaderboard?sort=${sort}&limit=${limit}`));
    return Array.isArray(r.entries) ? r.entries.filter(isEntry) : [];
  }
  leaderboardStream(onEntry: (e: LeaderboardEntry) => void): () => void {
    if (typeof EventSource === "undefined") return () => {};
    const es = new EventSource(`${BASE}/leaderboard/stream`);
    es.onmessage = (m) => entriesFromMessage(String(m.data)).forEach(onEntry);
    return () => es.close();
  }
  async leaderboardEntry(caseId: string): Promise<LeaderboardDetail> {
    return json<LeaderboardDetail>(await fetch(`${BASE}/leaderboard/${encodeURIComponent(caseId)}`));
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

interface MockCase {
  caseId: string;
  personas: [Persona, Persona];
  ticket: number;
  pitch: string;
  revenueEur?: number;
  repoUrl?: string;
  round: number;
  serial: string;
  totals: MockTotals;
  startedAt: number;
  applicant: { applicantId: string; startupName: string; founderName: string; oneLiner: string | null; photo: string | null } | null;
}

const PACE: Partial<Record<AnyRoastEvent["type"], number>> = { line: 450, analyzing: 900, intake: 700, fine: 120, meltdown: 120 };

/** ?mock=1 — the fixture roast + v2 flow, streamed through the same SSE parser as the real server. */
export class MockApi implements Api {
  readonly mock = true;
  private cases = new Map<string, MockCase>();
  private applicants = new Map<string, { input: ApplicantInput; at: number; token: string; caseId?: string }>();
  private board: LeaderboardEntry[] = mockLeaderboard();
  private details = new Map<string, LeaderboardDetail>();
  private listeners = new Set<(e: LeaderboardEntry) => void>();
  private ticker = 0;
  constructor(private readonly countdownSec?: number) {}

  async personas() { return FIXTURE_PERSONAS; }
  async pairs() { return FIXTURE_PAIRS; }
  async register(input: ApplicantInput): Promise<QueueTicket> {
    await sleep(400);
    const t = mockTicket(this.countdownSec);
    this.applicants.set(t.applicantId, { input, at: Date.now(), token: t.applicantToken });
    return t;
  }
  private authorise(a: ApplicantAuth) {
    const rec = this.applicants.get(a.applicantId);
    if (!rec || rec.token !== a.applicantToken) throw new HttpError(403, "Forbidden: wrong applicant token");
    return rec;
  }
  async betterPlace(a: ApplicantAuth, cause: BetterPlaceCause): Promise<BetterPlaceResult> {
    await sleep(500);
    this.authorise(a);
    return { position: 1, skipped: 1_000_000 + Math.floor(Math.random() * 3_000_000), cause, quip: mockQuip(cause) };
  }
  async createCase(submission: Submission, officers?: [PersonaId, PersonaId], applicant?: ApplicantAuth): Promise<Case> {
    await sleep(350);
    const a = applicant ? this.authorise(applicant) : undefined;
    const existing = a?.caseId ? this.cases.get(a.caseId) : undefined;
    if (existing) return { caseId: existing.caseId, ticket: existing.ticket, officers: [existing.personas[0].id, existing.personas[1].id] };
    const applicantId = applicant?.applicantId;
    const pair = officers ?? FIXTURE_PAIRS[Math.floor(Math.random() * FIXTURE_PAIRS.length)]!.officers;
    const caseId = `mock-${Date.now().toString(36)}`;
    const ticket = 4812 + Math.floor(Math.random() * 900);
    const find = (id: PersonaId) => FIXTURE_PERSONAS.find((p) => p.id === id) ?? FIXTURE_PERSONAS[0]!;
    if (a) a.caseId = caseId;
    this.cases.set(caseId, {
      caseId,
      personas: [find(pair[0]), find(pair[1])],
      ticket,
      pitch: submission.text ?? "",
      revenueEur: submission.revenueEur,
      repoUrl: submission.kind === "repo" ? submission.repoUrl : undefined,
      round: 0,
      serial: `L-2026/${String(ticket).padStart(5, "0")}`,
      totals: { eur: 0, jail: 0, melted: false, n: 0 },
      startedAt: a?.at ?? Date.now(),
      applicant: a && applicantId ? { applicantId, startupName: a.input.startupName, founderName: a.input.founderName, oneLiner: a.input.oneLiner ?? null, photo: a.input.photo ?? null } : null,
    });
    return { caseId, ticket, officers: pair };
  }
  async stream(caseId: string, onEvent: (e: AnyRoastEvent) => void, signal: AbortSignal): Promise<void> {
    const c = this.cases.get(caseId);
    if (!c) throw new Error("no such case");
    const events = mockRoundEvents({ ...c, totals: c.totals }, c.round);
    const enc = new TextEncoder();
    const meanwhile = () => estimateMeanwhile(c.caseId, (Date.now() - c.startedAt) / 1000);
    const finish = (e: AnyRoastEvent) => (e.type === "verdict" ? this.finishVerdict(c, e.notice as NoticeV2, meanwhile()) : e);
    const body = new ReadableStream<Uint8Array>({
      start: async (ctrl) => {
        const send = (e: AnyRoastEvent) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        try {
          let lastTick = 0;
          for (const e of events) {
            await sleep(PACE[e.type] ?? 150, signal);
            if (Date.now() - lastTick > 5000 || e.type === "verdict") {
              lastTick = Date.now();
              send({ type: "meanwhile", meanwhile: meanwhile() });
            }
            send(await finish(e));
          }
          ctrl.close();
        } catch (err) {
          ctrl.error(err);
        }
      },
    });
    await pumpSse(body, onEvent);
  }
  private async finishVerdict(c: MockCase, n: NoticeV2, mw: ReturnType<typeof estimateMeanwhile>): Promise<AnyRoastEvent> {
    const notice: NoticeV2 = { ...n, meanwhile: mw };
    try {
      const badge = await drawBadge(notice, c.applicant?.photo ?? null);
      notice.badgeUrl = URL.createObjectURL(badge);
    } catch { /* no canvas */ }
    try {
      notice.reportUrl = URL.createObjectURL(buildReportPdf(notice));
    } catch { /* ignore */ }
    const entry: LeaderboardEntry = {
      caseId: c.caseId,
      startupName: notice.startupName,
      founderName: notice.founderName,
      oneLiner: c.applicant?.oneLiner ?? null,
      photoUrl: c.applicant?.photo ?? null,
      totalEur: notice.totalEur,
      totalJailMonths: notice.totalJailMonths,
      meltdown: notice.meltdown,
      topLaws: notice.tldr.map((t) => t.law).slice(0, 3),
      issuedAt: notice.issuedAt,
      meanwhile: mw,
    };
    this.details.set(c.caseId, { entry, findings: notice.findings });
    this.push(entry);
    return { type: "verdict", notice };
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
  async leaderboard(sort: LeaderboardSort, limit = 50): Promise<LeaderboardEntry[]> {
    await sleep(250);
    return mergeEntries([], this.board, sort, limit);
  }
  leaderboardStream(onEntry: (e: LeaderboardEntry) => void): () => void {
    this.listeners.add(onEntry);
    setTimeout(() => mergeEntries([], this.board, "fines", 20).forEach(onEntry), 200);
    if (!this.ticker) this.ticker = window.setInterval(() => this.push(mockNewEntry()), 15000);
    return () => {
      this.listeners.delete(onEntry);
      if (!this.listeners.size) {
        clearInterval(this.ticker);
        this.ticker = 0;
      }
    };
  }
  async leaderboardEntry(caseId: string): Promise<LeaderboardDetail> {
    await sleep(200);
    const d = this.details.get(caseId);
    if (d) return d;
    const entry = this.board.find((e) => e.caseId === caseId);
    if (!entry) throw new Error("File not found. It was probably never opened.");
    return { entry, findings: FIXTURE_FINDINGS };
  }
  private push(e: LeaderboardEntry): void {
    this.board = mergeEntries(this.board, [e], "recent", 200);
    this.listeners.forEach((l) => l(e));
  }
}

const FIXTURE_FINDINGS: LeaderboardDetail["findings"] = [
  { text: "Pitch deck contained the word “disruptive” (Annex III, by analogy)", provision: { id: "ai-act-annex-iii", label: "AI Act Annex III", title: "High-risk AI systems referred to in Article 6(2)", url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689" } },
  { text: "Personal data processed without asking anyone, including the founder", provision: { id: "gdpr-5", label: "GDPR Art. 5", title: "Principles relating to processing of personal data", url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679" } },
];
