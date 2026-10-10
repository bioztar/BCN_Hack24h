/** `?idea=` from the roast's "Get the real report" link: trimmed, capped, null when absent/blank. */
export const MAX_IDEA_CHARS = 8000;
export const MIN_IDEA_CHARS = 20;

export function ideaFromQuery(search: string): string | null {
  const v = new URLSearchParams(search).get("idea")?.replace(/\r/g, "").trim();
  return v ? v.slice(0, MAX_IDEA_CHARS) : null;
}
