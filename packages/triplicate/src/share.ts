import { meanwhileFor, fmtDuration } from "./rules";

export interface CardData {
  score: number;
  rank: string;
  rows: number;
  returned: number;
  durationMs: number;
  url: string;
}

/** 1080×1080 share card. No emblem: a paper form on EU blue with a stamp. */
export function drawCard(d: CardData): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1080;
  const x = c.getContext("2d")!;
  x.fillStyle = "#003399";
  x.fillRect(0, 0, 1080, 1080);
  x.fillStyle = "#ffcc00";
  x.font = "bold 34px Arial";
  x.textAlign = "center";
  x.fillText("EUROCRAT ARCADE · DG ROAST", 540, 78);

  // paper
  x.save();
  x.translate(540, 560);
  x.rotate(-0.015);
  x.fillStyle = "rgba(0,0,0,0.35)";
  x.fillRect(-392, -402, 800, 820);
  x.fillStyle = "#fbfaf4";
  x.fillRect(-400, -410, 800, 820);
  x.fillStyle = "#003399";
  x.fillRect(-400, -410, 800, 16);
  x.textAlign = "left";
  x.font = "bold 22px Arial";
  x.fillText("FORM TRP-3/EU · IN TRIPLICATE · COPY 1 OF 3", -360, -340);
  x.fillRect(-360, -326, 720, 3);
  x.fillStyle = "#111";
  x.font = "bold 92px Arial";
  x.fillText("IN TRIPLICATE", -360, -220);
  x.font = "bold 30px Arial";
  x.fillStyle = "#555";
  x.fillText("SCORE", -360, -130);
  x.fillStyle = "#003399";
  x.font = "bold 170px Arial";
  x.fillText(d.score.toLocaleString("en-GB"), -366, 20);
  x.fillStyle = "#111";
  x.font = "bold 46px Arial";
  x.fillText(d.rank, -360, 100);
  x.font = "28px Arial";
  x.fillStyle = "#333";
  x.fillText(`${d.rows} rows approved in triplicate · ${d.returned} forms returned`, -360, 160);
  x.fillText(`Processing time: ${fmtDuration(d.durationMs)}`, -360, 202);
  const m = meanwhileFor(d.durationMs);
  x.font = "italic 28px Arial";
  wrap(x, `Meanwhile, China released ${m.china} more ${m.china === 1 ? "model" : "models"}. Europe adopted ${m.euForms} new forms.`, -360, 262, 400, 38);
  x.restore();

  // stamp
  x.save();
  x.translate(790, 840);
  x.rotate(-0.22);
  x.scale(0.8, 0.8);
  x.strokeStyle = "#c8102e";
  x.fillStyle = "#c8102e";
  x.lineWidth = 10;
  x.strokeRect(-230, -78, 460, 156);
  x.lineWidth = 3;
  x.strokeRect(-216, -64, 432, 128);
  x.textAlign = "center";
  x.font = "bold 50px Arial";
  x.fillText("APPROVED", 0, -8);
  x.font = "bold 34px Arial";
  x.fillText("IN TRIPLICATE", 0, 40);
  x.restore();

  x.fillStyle = "#fff";
  x.font = "bold 30px Arial";
  x.textAlign = "center";
  x.fillText(d.url.replace(/^https?:\/\//, ""), 540, 1045);
  return c;
}

function wrap(x: CanvasRenderingContext2D, text: string, left: number, top: number, width: number, lh: number): void {
  let line = "";
  let y = top;
  for (const w of text.split(" ")) {
    const t = line ? `${line} ${w}` : w;
    if (x.measureText(t).width > width && line) {
      x.fillText(line, left, y);
      line = w;
      y += lh;
    } else line = t;
  }
  if (line) x.fillText(line, left, y);
}

export async function shareCard(d: CardData): Promise<"shared" | "downloaded" | "failed"> {
  const canvas = drawCard(d);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return "failed";
  const file = new File([blob], "in-triplicate.png", { type: "image/png" });
  const text = `I scored ${d.score} in In Triplicate — rank: ${d.rank}. ${d.url}`;
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "In Triplicate", text });
      return "shared";
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") return "failed";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "in-triplicate.png";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return "downloaded";
}
