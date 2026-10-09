/**
 * PERSONA.md rule 4: the wall shows the officials' sentence only, never the visitor's text.
 * There is no moderation filter on the officials' lines (Vitaly, 2026-10-09); this guard
 * only keeps a line off the wall when it parrots a 5-word run of the visitor's own words.
 */
export function quotesVisitor(line: string, visitorTexts: string[]): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9à-ÿ ]+/g, " ").split(/\s+/).filter(Boolean);
  const words = norm(line);
  const grams = new Set<string>();
  for (let i = 0; i + 5 <= words.length; i++) grams.add(words.slice(i, i + 5).join(" "));
  if (!grams.size) return false;
  for (const v of visitorTexts) {
    const w = norm(v);
    for (let i = 0; i + 5 <= w.length; i++) if (grams.has(w.slice(i, i + 5).join(" "))) return true;
  }
  return false;
}
