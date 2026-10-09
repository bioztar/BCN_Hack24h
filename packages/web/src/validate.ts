const REPO_RE = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/;

/** Client-side mirror of the server's intake rule: https://github.com/<owner>/<repo> only. */
export function parseRepoUrl(input: string): { owner: string; repo: string; url: string } | null {
  const m = REPO_RE.exec(input.trim());
  if (!m) return null;
  const [, owner, repo] = m as unknown as [string, string, string];
  if (repo === "." || repo === "..") return null;
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

/** ≤ `max` words of the visitor's pitch for the Notice recital (never the wall); null if empty. */
export function quoteClaim(text: string | undefined, max = 12): string | null {
  const words = (text ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const head = words.slice(0, max).join(" ").replace(/[\s,;:.!?…-]+$/, "");
  return words.length > max ? `${head}…` : head;
}

export function parseRevenue(input: string): number | undefined {
  const cleaned = input.replace(/[€\s,_]/g, "").replace(/eur$/i, "");
  if (!cleaned) return undefined;
  const m = /^(\d+(?:\.\d+)?)([kmb])?$/i.exec(cleaned);
  if (!m) return undefined;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? "").toLowerCase() as "k" | "m" | "b"] ?? 1;
  const n = Number(m[1]) * mult;
  return Number.isFinite(n) && n >= 0 && n < 1e13 ? Math.round(n) : undefined;
}
