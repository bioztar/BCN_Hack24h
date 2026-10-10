export type View = "qr" | "board" | "case" | "arcade";
export const KEYS: Record<string, View> = { q: "qr", l: "board", c: "case", a: "arcade" };

export function parseView(v: string | null): View {
  const k = (v ?? "").toLowerCase();
  if (k in KEYS) return KEYS[k]!;
  return (["qr", "board", "case", "arcade"] as View[]).find((x) => x === k) ?? (k === "leaderboard" ? "board" : "qr");
}
