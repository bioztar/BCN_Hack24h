/** Bundled fonts (OFL / Liberation licences alongside) — the runtime image has no system fonts. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fonts");

export const FONT_FILES = {
  display: path.join(DIR, "Anton-Regular.ttf"),
  serif: path.join(DIR, "LiberationSerif-Regular.ttf"),
  serifBold: path.join(DIR, "LiberationSerif-Bold.ttf"),
  serifItalic: path.join(DIR, "LiberationSerif-Italic.ttf"),
  sans: path.join(DIR, "LiberationSans-Regular.ttf"),
  sansBold: path.join(DIR, "LiberationSans-Bold.ttf"),
} as const;
export type FontKey = keyof typeof FONT_FILES;

let buffers: Uint8Array[] | null = null;
export function fontBuffers(): Uint8Array[] {
  buffers ??= Object.values(FONT_FILES).map((f) => new Uint8Array(readFileSync(f)));
  return buffers;
}

let meter: PDFKit.PDFDocument | null = null;
/** Advance width of `text` in px at `size` (letterSpacing in px per glyph gap). */
export function textWidth(text: string, font: FontKey, size: number, letterSpacing = 0): number {
  if (!meter) {
    meter = new PDFDocument({ autoFirstPage: false });
    for (const [k, f] of Object.entries(FONT_FILES)) meter.registerFont(k, f);
  }
  return meter.font(font).fontSize(size).widthOfString(text) + letterSpacing * Math.max(0, [...text].length - 1);
}

/** Largest font size ≤ max (≥ min) at which `text` fits in `width`. */
export function fitSize(text: string, font: FontKey, width: number, max: number, min = 8, letterSpacing = 0): number {
  const w = textWidth(text, font, max, letterSpacing * 1);
  if (w <= width) return max;
  return Math.max(min, Math.floor((max * width) / w));
}

/** Shortens `text` with an ellipsis until it fits `width` at `size`. */
export function ellipsize(text: string, font: FontKey, size: number, width: number): string {
  if (textWidth(text, font, size) <= width) return text;
  const chars = [...text];
  while (chars.length > 1 && textWidth(chars.join("") + "…", font, size) > width) chars.pop();
  return chars.join("").trimEnd() + "…";
}
