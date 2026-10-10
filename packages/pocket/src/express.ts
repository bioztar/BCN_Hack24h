/** Express mode (one stream, tiers 1→5, one appeal) is the default; `?express=0` brings back the staged argue-back rounds. */
export const EXPRESS_DEFAULT = true;

export function isExpress(params: URLSearchParams = new URLSearchParams(location.search), def = EXPRESS_DEFAULT): boolean {
  const v = params.get("express");
  if (v === null) return def;
  return v !== "0" && v !== "false";
}

export interface WhackResult { banned: number; mistral: number; }

/** The `{type:"score", game:"whack"}` postMessage from `/game/whack/?embed=1`, or null. */
export function whackResult(data: unknown): WhackResult | null {
  const d = data as { type?: unknown; game?: unknown; hits?: unknown; mistralHits?: unknown } | null;
  if (!d || d.type !== "score" || d.game !== "whack") return null;
  const hits = Number(d.hits);
  if (!Number.isFinite(hits)) return null;
  const mistral = Number(d.mistralHits);
  return { banned: Math.max(0, Math.round(hits)), mistral: Number.isFinite(mistral) ? Math.max(0, Math.round(mistral)) : 0 };
}

export function whackLine(r: WhackResult): string {
  const base = `While we audited your repo you banned ${r.banned.toLocaleString("en-GB")} American/Chinese model${r.banned === 1 ? "" : "s"}`;
  return r.mistral ? `${base} — and stamped Mistral ×${r.mistral}. The only one we had.` : `${base}.`;
}

/** The real compliance analyzer, prefilled with the pitch. */
export function wardenUrl(pitch: string): string {
  const idea = pitch.trim().slice(0, 1500);
  return `https://warden.pro7ocol.com/analyze/${idea ? `?idea=${encodeURIComponent(idea)}` : ""}`;
}

/** "Faceify" → "Faceify (pivot 2)" → "Faceify (pivot 3)", within the 60-char name limit. */
export function pivotName(name: string): string {
  const m = /^(.*) \(pivot (\d+)\)$/.exec(name);
  const base = (m ? m[1]! : name).trim();
  const tag = ` (pivot ${m ? Number(m[2]) + 1 : 2})`;
  return base.slice(0, 60 - tag.length) + tag;
}
