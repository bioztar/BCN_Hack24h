/** Deterministic PRNG (mulberry32) so a round is reproducible from its seed. */
export type Rng = () => number;

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFor(seed: string): Rng {
  return mulberry32(hashSeed(seed));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error("pick from empty list");
  return item;
}

export function weightedPick<T extends { weight: number }>(rng: Rng, items: readonly T[]): T {
  const total = items.reduce((s, m) => s + m.weight, 0);
  let r = rng() * total;
  for (const m of items) {
    r -= m.weight;
    if (r < 0) return m;
  }
  const last = items[items.length - 1];
  if (!last) throw new Error("pick from empty list");
  return last;
}
