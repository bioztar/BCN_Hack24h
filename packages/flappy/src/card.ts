import type { Reg } from "./logic";

export interface CardData {
  score: number;
  rank: string;
  killer: Reg;
  meanwhile: string;
  fileNo: string;
}
const S = 1080;

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > maxW && line) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

export function drawCard(d: CardData): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#003399";
  g.fillRect(0, 0, S, S);
  g.fillStyle = "#fbfaf4";
  g.fillRect(60, 60, S - 120, S - 120);
  g.fillStyle = "#003399";
  g.fillRect(60, 60, S - 120, 150);
  g.fillStyle = "#ffcc00";
  g.font = "bold 30px Arial";
  g.fillText("★ ★ ★", 100, 125);
  g.fillStyle = "#fff";
  g.font = "bold 50px Arial";
  g.fillText("REGULATORY FLAPPY", 230, 132);
  g.font = "24px Arial";
  g.fillText(`FORM FL-27/B · NOTICE OF DISSOLUTION · FILE ${d.fileNo}`, 100, 182);

  g.fillStyle = "#003399";
  g.font = "bold 34px Arial";
  g.fillText("PILLARS OF EU LAW PASSED", 100, 290);
  g.font = "bold 260px Arial";
  g.fillText(String(d.score), 92, 520);
  g.fillStyle = "#111";
  g.font = "bold 44px Arial";
  g.fillText(`Rank: ${d.rank}`, 100, 600);

  g.fillStyle = "#e9edf5";
  g.fillRect(100, 640, S - 200, 200);
  g.fillStyle = "#003399";
  g.fillRect(100, 640, 10, 200);
  g.fillStyle = "#111";
  g.font = "bold 32px Arial";
  g.fillText(`Dissolved by ${d.killer.label}`, 135, 690);
  g.font = "28px Arial";
  wrap(g, d.killer.fact, S - 280).slice(0, 4).forEach((l, i) => g.fillText(l, 135, 735 + i * 34));

  g.fillStyle = "#333";
  g.font = "italic 28px Arial";
  wrap(g, `Meanwhile: ${d.meanwhile}`, S - 200).slice(0, 2).forEach((l, i) => g.fillText(l, 100, 900 + i * 34));
  g.fillStyle = "#003399";
  g.font = "bold 28px Arial";
  g.fillText("eurocrat.pro7ocol.com/flappy/", 100, 990);

  g.save();
  g.translate(780, 400);
  g.rotate(-0.22);
  g.strokeStyle = g.fillStyle = "rgba(200,16,46,0.85)";
  g.lineWidth = 12;
  g.font = "bold 96px Arial";
  const w = g.measureText("DISSOLVED").width + 60;
  g.strokeRect(-w / 2, -80, w, 140);
  g.textAlign = "center";
  g.fillText("DISSOLVED", 0, 25);
  g.restore();
  return c;
}

export async function shareCard(d: CardData): Promise<"shared" | "downloaded"> {
  const canvas = drawCard(d);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("no blob");
  const file = new File([blob], `regulatory-flappy-${d.score}.png`, { type: "image/png" });
  const text = `My startup passed ${d.score} pillars of EU law before ${d.killer.label} dissolved it. Rank: ${d.rank}.`;
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "Regulatory Flappy", text });
      return "shared";
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return "shared";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return "downloaded";
}
