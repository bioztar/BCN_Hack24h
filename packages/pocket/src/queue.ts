import type { BetterPlaceCause } from "./types";

/** Queue position after `elapsedSec` of a `countdownSec` countdown: plunges, then crawls, exactly 0 at the end. */
export function positionAt(start: number, elapsedSec: number, countdownSec: number): number {
  if (countdownSec <= 0 || elapsedSec >= countdownSec) return 0;
  const t = Math.max(0, elapsedSec / countdownSec);
  const left = Math.pow(1 - t, 2.4);
  return Math.max(1, Math.round(start * left));
}

export function formatPosition(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString("en-GB");
}

export const CAUSES: { id: BetterPlaceCause; label: string; emoji: string; color: string }[] = [
  { id: "climate", label: "Climate", emoji: "🌍", color: "#1e8f4e" },
  { id: "ai-safety", label: "AI safety", emoji: "🤖", color: "#5b2bbf" },
  { id: "refugees", label: "Refugees", emoji: "🛟", color: "#e2531d" },
  { id: "ukraine", label: "Ukraine", emoji: "🌻", color: "#0057b7" },
  { id: "lgbtq", label: "LGBTQ+", emoji: "🏳️‍🌈", color: "#c2185b" },
  { id: "gender-equality", label: "Gender equality", emoji: "⚖️", color: "#7b1fa2" },
  { id: "homeless", label: "Homelessness", emoji: "🏠", color: "#6d4c41" },
  { id: "rare-diseases", label: "Rare diseases", emoji: "🧬", color: "#00838f" },
  { id: "animal-welfare", label: "Animal welfare", emoji: "🐾", color: "#ef6c00" },
  { id: "accessibility", label: "Accessibility", emoji: "♿", color: "#1565c0" },
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
