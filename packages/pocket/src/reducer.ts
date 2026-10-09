import type { Notice, Persona, RepoIntake, RoastEvent, Tier } from "./types";

export type LineEvent = Extract<RoastEvent, { type: "line" }>;
export type Phase = "idle" | "submitting" | "streaming" | "awaiting" | "verdict" | "error";

export interface RoastState {
  phase: Phase;
  caseId: string | null;
  officers: Persona[] | null;
  ticket: number | null;
  tier: Tier | null;
  tierName: string | null;
  intake: RepoIntake | null;
  lines: LineEvent[];
  prompt: string | null;
  notice: Notice | null;
  error: string | null;
}

export type Action =
  | RoastEvent
  | { type: "reset" }
  | { type: "submit" }
  | { type: "case"; caseId: string; ticket: number }
  | { type: "round" }
  | { type: "closed" }
  | { type: "failed"; message: string };

export const initialState: RoastState = {
  phase: "idle",
  caseId: null,
  officers: null,
  ticket: null,
  tier: null,
  tierName: null,
  intake: null,
  lines: [],
  prompt: null,
  notice: null,
  error: null,
};

export function reduce(s: RoastState, a: Action): RoastState {
  switch (a.type) {
    case "reset":
      return initialState;
    case "submit":
      return { ...initialState, phase: "submitting" };
    case "case":
      return { ...s, caseId: a.caseId, ticket: a.ticket, phase: "streaming" };
    case "round":
      return { ...s, phase: "streaming", prompt: null, error: null };
    case "officers":
      return { ...s, officers: [...a.officers], ticket: a.ticket };
    case "intake":
      return { ...s, intake: a.repo };
    case "tier":
      if (s.tier !== null && a.tier < s.tier) return s;
      return { ...s, tier: a.tier, tierName: a.name };
    case "line":
      if (s.lines.some((l) => l.id === a.id)) return s;
      return { ...s, lines: [...s.lines, a] };
    case "audio":
      return s;
    case "awaiting":
      if (s.phase === "verdict") return s;
      return { ...s, phase: "awaiting", prompt: a.prompt };
    case "verdict":
      return { ...s, phase: "verdict", notice: a.notice, prompt: null };
    case "error":
    case "failed":
      return { ...s, phase: "error", error: a.message };
    case "closed":
      return s.phase === "streaming" ? { ...s, phase: "error", error: "The Commission hung up mid-procedure." } : s;
  }
}

/** True once the round has nothing more to stream. */
export function roundOver(s: RoastState): boolean {
  return s.phase === "awaiting" || s.phase === "verdict" || s.phase === "error";
}
