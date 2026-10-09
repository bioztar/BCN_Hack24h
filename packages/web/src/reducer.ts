import { TIER_NAMES, type ClipSlot, type Notice, type Persona, type PersonaId, type RepoIntake, type RoastEvent, type Tier } from "./contract";

export type LineEvent = Extract<RoastEvent, { type: "line" }>;
export type StampText = NonNullable<LineEvent["stamp"]>;

export type Phase = "connecting" | "streaming" | "awaiting" | "verdict" | "error";

export interface StageState {
  phase: Phase;
  officers: [Persona, Persona] | null;
  ticket: number | null;
  tier: Tier;
  tierName: string;
  lines: LineEvent[];
  current: LineEvent | null;
  speaker: PersonaId | null;
  clip: ClipSlot;
  stamps: { lineId: string; text: StampText; tier: Tier }[];
  intake: RepoIntake | null;
  awaiting: string | null;
  notice: Notice | null;
  error: string | null;
  round: number;
}

/** Local actions on top of the server's RoastEvents. */
export type StageAction =
  | RoastEvent
  | { type: "line-end"; id: string }
  | { type: "reply"; text: string }
  | { type: "connection-lost"; message: string };

export function initialState(officers: [Persona, Persona] | null = null): StageState {
  return {
    phase: "connecting",
    officers,
    ticket: null,
    tier: 1,
    tierName: TIER_NAMES[0],
    lines: [],
    current: null,
    speaker: null,
    clip: "intro",
    stamps: [],
    intake: null,
    awaiting: null,
    notice: null,
    error: null,
    round: 1,
  };
}

function clampTier(n: unknown): Tier {
  const t = Math.round(Number(n));
  return (t >= 1 && t <= 5 ? t : 1) as Tier;
}

export function reduce(s: StageState, a: StageAction): StageState {
  switch (a.type) {
    case "officers":
      return { ...s, officers: a.officers, ticket: a.ticket ?? s.ticket, phase: s.phase === "connecting" ? "streaming" : s.phase };
    case "intake":
      return { ...s, intake: a.repo, clip: "repo-horror" };
    case "tier": {
      const tier = clampTier(a.tier);
      if (tier < s.tier) return s; // tiers never go down
      return { ...s, tier, tierName: a.name || TIER_NAMES[tier - 1], clip: `tier${tier}` as ClipSlot, phase: "streaming" };
    }
    case "line": {
      if (s.lines.some((l) => l.id === a.id)) return s;
      const provisions = (a.provisions ?? []).filter((p) => p && /^https:\/\//.test(p.url));
      const line = { ...a, provisions };
      const stamps = a.stamp ? [...s.stamps, { lineId: a.id, text: a.stamp, tier: s.tier }] : s.stamps;
      return {
        ...s,
        phase: s.phase === "verdict" ? s.phase : "streaming",
        lines: [...s.lines, line],
        current: line,
        speaker: a.speaker,
        clip: a.stamp ? "stamp" : a.clip || "talking",
        stamps,
      };
    }
    case "line-end":
      if (s.current?.id !== a.id) return s;
      return { ...s, speaker: null, clip: s.phase === "verdict" ? "verdict" : "idle" };
    case "awaiting":
      return { ...s, phase: "awaiting", awaiting: a.prompt, speaker: null, clip: "listening" };
    case "verdict":
      return { ...s, phase: "verdict", notice: a.notice, awaiting: null, clip: "verdict", tier: 5, tierName: TIER_NAMES[4] };
    case "error":
      return { ...s, phase: "error", error: a.message };
    case "connection-lost":
      return s.phase === "verdict" || s.phase === "awaiting" ? s : { ...s, phase: "error", error: a.message };
    case "reply":
      return { ...s, phase: "connecting", awaiting: null, error: null, current: null, round: s.round + 1, clip: "listening" };
    default:
      return s;
  }
}

/** Which still a persona should show for a clip slot when there is no video. */
export function expressionFor(slot: ClipSlot, speaking: boolean): "neutral" | "stamping" | "smug" | "appalled" | "asleep" {
  switch (slot) {
    case "stamp":
      return "stamping";
    case "asleep":
      return "asleep";
    case "repo-horror":
    case "tier4":
    case "tier5":
      return "appalled";
    case "verdict":
    case "tier2":
    case "tier3":
      return "smug";
    default:
      return speaking ? "smug" : "neutral";
  }
}
