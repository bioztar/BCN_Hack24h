/** Keeps only characters the bundled fonts can draw: no emoji, flags, ZWJ/VS16 or CJK tofu boxes. */
import { createRequire } from "node:module";
import { FONT_FILES } from "./fonts.js";

interface FkFont {
  hasGlyphForCodePoint(cp: number): boolean;
}
let font: FkFont | null = null;
const PICTO = /[\p{Extended_Pictographic}\u{FE0E}\u{FE0F}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}]/gu;

export function printable(s: string): string {
  font ??= (createRequire(import.meta.url)("fontkit") as { openSync(p: string): FkFont }).openSync(FONT_FILES.sans);
  let out = "";
  for (const ch of s.replace(PICTO, "")) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) out += " ";
    else if (font.hasGlyphForCodePoint(cp)) out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}
