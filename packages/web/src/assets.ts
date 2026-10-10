import type { ClipSlot, Persona } from "./contract";

/** URLs that failed to load this session; never retried. */
const broken = new Set<string>();

export function markBroken(url: string): void {
  broken.add(url);
}

export function isBroken(url: string | undefined): boolean {
  return !url || broken.has(url);
}

export type Visual =
  | { kind: "clip"; url: string; loop: boolean }
  /** Talking-portrait puppet; `images` in preference order (empty → procedural silhouette). */
  | { kind: "puppet"; images: string[] };

const LOOPING: ClipSlot[] = ["idle", "listening", "talking", "asleep"];
export type Expression = keyof Persona["stills"];

/** Transparent cut-outs from the asset pipeline (PLAN v1.5); may be missing. */
export function cutoutUrl(id: string, expr: Expression): string {
  return `/assets/generated/cutout/${id}-${expr}.png`;
}

/** cut-out for the expression → still for it → neutral cut-out → neutral still → any still. */
export function portraitCandidates(p: Persona, expr: Expression, bad: (url: string | undefined) => boolean = isBroken): string[] {
  const stills = p.stills ?? {};
  const all = [cutoutUrl(p.id, expr), stills[expr], cutoutUrl(p.id, "neutral"), stills.neutral, ...Object.values(stills)];
  return [...new Set(all.filter((u): u is string => !!u && !bad(u)))];
}

/**
 * Optional clip for the slot → the puppet (cut-out → still → silhouette).
 * GLB busts (`model3d`) are never loaded: they looked worse than the cut-outs.
 */
export function pickVisual(p: Persona, slot: ClipSlot, expression: Expression, bad: (url: string | undefined) => boolean = isBroken): Visual {
  const clip = p.clips?.[slot];
  if (clip && !bad(clip)) return { kind: "clip", url: clip, loop: LOOPING.includes(slot) };
  return { kind: "puppet", images: portraitCandidates(p, expression, bad) };
}

export function initials(name: string): string {
  const words = name.replace(/^(Dr\.|Mme|Mr\.|Ms\.|Inspector|Baroness|The)\s+/gi, "").split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
}
