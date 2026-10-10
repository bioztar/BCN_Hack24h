/** Deterministic randomness: same key → same sequence (fines, quips, meanwhile rates per caseId). */
import { createHash } from "node:crypto";

export function seeded(...key: (string | number)[]): () => number {
  let a = createHash("sha256").update(key.join("|")).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(list: readonly T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length) % list.length]!;
}
