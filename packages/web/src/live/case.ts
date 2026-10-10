import { TIER_NAMES, type Meanwhile, type Notice, type NoticeV2, type Persona, type RepoIntake, type Tier } from "../contract";
import type { LineEvent } from "../reducer";
import type { AnyEvent } from "./api";
import { applyFine, applyMeltdown, emptyMeter, type Meter } from "./fines";
import { maxMeanwhile, toMeanwhile } from "./meanwhile";

/** What the room sees of the live case: a read-only mirror of the phone's hearing. */
export interface LiveState {
  caseId: string | null;
  ticket: number | null;
  startupName: string | null;
  officers: [Persona, Persona] | null;
  tier: Tier;
  tierName: string;
  line: LineEvent | null;
  seen: string[];
  meter: Meter;
  meanwhile: Meanwhile | null;
  analyzing: { stage: string; progress: number } | null;
  intake: RepoIntake | null;
  awaiting: string | null;
  notice: Notice | NoticeV2 | null;
  error: string | null;
}

export function emptyLive(caseId: string | null = null, ticket: number | null = null, startupName: string | null = null): LiveState {
  return { caseId, ticket, startupName, officers: null, tier: 1, tierName: TIER_NAMES[0], line: null, seen: [], meter: emptyMeter(), meanwhile: null, analyzing: null, intake: null, awaiting: null, notice: null, error: null };
}

const clamp01 = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export function isV2Notice(n: Notice | NoticeV2 | null): n is NoticeV2 {
  return !!n && typeof (n as NoticeV2).totalEur === "number";
}

/** Pure: applies one stream event. Replays are idempotent (lines and fines dedupe by id). */
export function liveReduce(s: LiveState, e: AnyEvent): LiveState {
  switch (e.type) {
    case "officers":
      return Array.isArray(e.officers) && e.officers.length === 2 ? { ...s, officers: e.officers, ticket: e.ticket ?? s.ticket } : s;
    case "tier": {
      const t = Math.round(Number(e.tier));
      const tier = (t >= 1 && t <= 5 ? t : s.tier) as Tier;
      return { ...s, tier, tierName: e.name || TIER_NAMES[tier - 1], awaiting: null };
    }
    case "intake":
      return { ...s, intake: e.repo, analyzing: null };
    case "analyzing":
      return { ...s, analyzing: clamp01(e.progress) >= 1 ? null : { stage: String(e.stage ?? ""), progress: clamp01(e.progress) } };
    case "line":
      if (s.seen.includes(e.id)) return s;
      return { ...s, line: e, seen: [...s.seen, e.id], analyzing: null, awaiting: null };
    case "audio":
      return s.line && s.line.id === e.id ? { ...s, line: { ...s.line, audioUrl: e.audioUrl } } : s;
    case "fine":
      return { ...s, meter: applyFine(s.meter, e) };
    case "meltdown":
      return { ...s, meter: applyMeltdown(s.meter, e) };
    case "meanwhile": {
      const m = toMeanwhile(e.meanwhile);
      return m ? { ...s, meanwhile: s.meanwhile ? maxMeanwhile(s.meanwhile, m) : m } : s;
    }
    case "awaiting":
      return s.notice ? s : { ...s, awaiting: e.prompt };
    case "verdict": {
      const n = e.notice as Notice | NoticeV2;
      let meter = s.meter;
      if (isV2Notice(n)) {
        meter = { ...meter, totalEur: Math.max(meter.totalEur, n.totalEur), totalJailMonths: Math.max(meter.totalJailMonths, n.totalJailMonths), meltdown: meter.meltdown || n.meltdown };
      }
      const meanwhile = isV2Notice(n) && n.meanwhile ? (s.meanwhile ? maxMeanwhile(s.meanwhile, n.meanwhile) : n.meanwhile) : s.meanwhile;
      return { ...s, notice: n, meter, meanwhile, awaiting: null, analyzing: null, startupName: (isV2Notice(n) && n.startupName) || n.startup || s.startupName };
    }
    case "error":
      return { ...s, error: e.message };
    default:
      return s;
  }
}
