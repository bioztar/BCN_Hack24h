const q = new URLSearchParams(location.search);
const flag = (k: string) => q.has(k) && q.get(k) !== "0";

export const MOCK = flag("mock");
export const EMBED = flag("embed");
/** Set on links from the arcade so an embedded game can offer "back to arcade". */
export const FROM_ARCADE = flag("arcade");

/** Carry ?mock / ?embed across arcade ↔ game links. */
export function withFlags(href: string, extra: Record<string, string> = {}): string {
  const u = new URL(href, location.href);
  if (MOCK) u.searchParams.set("mock", "1");
  if (EMBED) u.searchParams.set("embed", "1");
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return u.origin === location.origin ? u.pathname + u.search : u.href;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export const fmt = (n: number) => n.toLocaleString("en-GB");
