/** Number and time formatting shared by the badge and the PDF. */

/** €1,234,567 — full figure with thousands separators. */
export function formatEur(n: number): string {
  const v = Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
  return `€${v.toLocaleString("en-US")}`;
}

/** €35 M, €1.2 bn, €4,900 — for headlines where the full figure would not fit. */
export function formatEurShort(n: number): string {
  const v = Math.max(0, Number.isFinite(n) ? n : 0);
  const trim = (x: number) => (x >= 100 ? Math.round(x).toString() : x.toFixed(1).replace(/\.0$/, ""));
  if (v >= 1e12) return `€${trim(v / 1e12)} trillion`;
  if (v >= 1e9) return `€${trim(v / 1e9)} bn`;
  if (v >= 1e6) return `€${trim(v / 1e6)} M`;
  return formatEur(v);
}

const plural = (n: number, one: string) => `${n.toLocaleString("en-US")} ${one}${n === 1 ? "" : "s"}`;

/** 171 → "14 years 3 months"; 12 → "1 year"; 0 → "0 months". */
export function formatJail(months: number): string {
  const m = Math.max(0, Math.round(Number.isFinite(months) ? months : 0));
  const years = Math.floor(m / 12);
  const rest = m % 12;
  if (!years) return plural(rest, "month");
  return rest ? `${plural(years, "year")} ${plural(rest, "month")}` : plural(years, "year");
}

/** 252 → "4 min 12 s". */
export function formatElapsed(sec: number): string {
  const s = Math.max(0, Math.round(Number.isFinite(sec) ? sec : 0));
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h} h ${min} min`;
  return min ? `${min} min ${r} s` : `${r} s`;
}

/** "2026-10-10T15:04:00Z" → "10 October 2026". */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" });
}

/** Deterministic 0..1 from a string (FNV-1a), so the same case always gets the same jokes. */
export function seeded(key: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function pick<T>(list: readonly T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length) % list.length]!;
}
