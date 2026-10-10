/** 1080² share card drawn on a canvas (no DOM snapshot lib), shared via Web Share or downloaded. */
import { drawStarRing } from "./stars";

export interface CardSpec {
  game: string;
  score: string;
  title: string;
  lines: string[];
  stamp: string;
  footer: string;
  formNo: string;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      out.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}

export function drawCard(spec: CardSpec): HTMLCanvasElement {
  const S = 1080;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#003399";
  ctx.fillRect(0, 0, S, S);
  drawStarRing(ctx, S / 2, S / 2, 470, 26, "rgba(255,204,0,0.18)");
  ctx.fillStyle = "#fbfaf4";
  ctx.fillRect(70, 150, S - 140, S - 290);
  ctx.fillStyle = "#003399";
  ctx.fillRect(70, 150, S - 140, 14);
  drawStarRing(ctx, 150, 82, 44, 9);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.font = "bold 46px Arial";
  ctx.fillText("EUROCRAT", 220, 70);
  ctx.font = "28px Arial";
  ctx.fillStyle = "#ffcc00";
  ctx.fillText(spec.game.toUpperCase(), 222, 112);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#003399";
  ctx.font = "bold 22px Arial";
  ctx.fillText(spec.formNo, 110, 215);
  ctx.fillRect(110, 228, S - 220, 3);
  ctx.fillStyle = "#111";
  ctx.font = "bold 190px Arial";
  ctx.fillText(spec.score, 104, 420);
  ctx.font = "bold 50px Arial";
  ctx.fillStyle = "#003399";
  ctx.fillText(spec.title, 110, 500);
  ctx.fillStyle = "#222";
  ctx.font = "32px Arial";
  let y = 580;
  for (const line of spec.lines) for (const l of wrap(ctx, line, S - 230)) {
    if (y > S - 190) break;
    ctx.fillText(l, 110, y);
    y += 44;
  }
  ctx.save();
  ctx.translate(S - 270, 330);
  ctx.rotate(-0.22);
  ctx.strokeStyle = "rgba(200,16,46,0.85)";
  ctx.fillStyle = "rgba(200,16,46,0.85)";
  ctx.lineWidth = 10;
  ctx.font = "bold 64px Arial";
  const w = Math.min(420, ctx.measureText(spec.stamp).width + 50);
  ctx.strokeRect(-w / 2, -55, w, 110);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(spec.stamp, 0, 4, w - 40);
  ctx.restore();
  ctx.fillStyle = "#fff";
  ctx.font = "26px Arial";
  ctx.textAlign = "center";
  ctx.fillText(spec.footer, S / 2, S - 70);
  return c;
}

export async function shareCard(spec: CardSpec, filename: string, text: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const canvas = drawCard(spec);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) return "cancelled";
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
  return "downloaded";
}
