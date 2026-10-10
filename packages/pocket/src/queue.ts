import type { BetterPlaceCause } from "./types";

/**
 * Queue position after `elapsedSec` of a `countdownSec` countdown.
 * Visible motion across the WHOLE duration, exactly 0 at the end — never a near-instant
 * drop to 0. The exponent scales down for short countdowns (server default is 5-8 s for
 * the demo) so a short queue still reads as counting down, not as a glitch.
 */
export function positionAt(start: number, elapsedSec: number, countdownSec: number): number {
  if (countdownSec <= 0 || elapsedSec >= countdownSec) return 0;
  const t = Math.max(0, elapsedSec / countdownSec);
  const exponent = countdownSec <= 10 ? 1.15 : 2.4;
  const left = Math.pow(1 - t, exponent);
  return Math.max(1, Math.round(start * left));
}

export function formatPosition(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString("en-GB");
}

export const CAUSES: { id: BetterPlaceCause; label: string; desc: string; emoji: string; color: string }[] = [
  { id: "climate", label: "Climate", desc: "Jump the queue for the planet", emoji: "🌍", color: "#1e8f4e" },
  { id: "ai-safety", label: "AI safety", desc: "Claim your AI is aligned", emoji: "🤖", color: "#5b2bbf" },
  { id: "refugees", label: "Refugees", desc: "Say you help displaced people", emoji: "🛟", color: "#e2531d" },
  { id: "ukraine", label: "Ukraine", desc: "Invoke solidarity, skip the line", emoji: "🌻", color: "#0057b7" },
  { id: "lgbtq", label: "LGBTQ+", desc: "Tick the inclusion box", emoji: "🏳️‍🌈", color: "#c2185b" },
  { id: "gender-equality", label: "Gender equality", desc: "Mention your female co-founder", emoji: "⚖️", color: "#7b1fa2" },
  { id: "homeless", label: "Homelessness", desc: "Pivot to 'social impact'", emoji: "🏠", color: "#6d4c41" },
  { id: "rare-diseases", label: "Rare diseases", desc: "Add a medical use case, fast", emoji: "🧬", color: "#00838f" },
  { id: "animal-welfare", label: "Animal welfare", desc: "Rescue a dog in your pitch deck", emoji: "🐾", color: "#ef6c00" },
  { id: "accessibility", label: "Accessibility", desc: "Add one alt-text, cut the queue", emoji: "♿", color: "#1565c0" },
];

export const QUEUE_JOKES = [
  "Your application is important to us. So is lunch.",
  "Now serving: an applicant from 2019.",
  "Please do not leave the queue. Leaving the queue requires Form Q-7.",
  "A clerk has been assigned. The clerk is on strike.",
  "Your number has been translated into 24 official languages.",
  "Tip: the queue moves faster if you stop founding things.",
  "The Council has adjourned. The queue has not.",
  "Estimated wait recalculated by a committee of 27.",
];
