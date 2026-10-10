export interface ShareInfo {
  score: number;
  title: string;
  correct: number;
  total: number;
  bestStreak: number;
  meanwhile: string;
  url: string;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): number {
  let line = "";
  for (const w of text.split(" ")) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lh;
    } else line = t;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lh;
}

export function drawShareCard(s: ShareInfo): HTMLCanvasElement {
  const W = 1080;
  const H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#003399";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffcc00";
  ctx.fillRect(0, 0, W, 14);
  ctx.fillRect(0, H - 14, W, 14);

  ctx.fillStyle = "#fffef8";
  ctx.fillRect(70, 150, W - 140, H - 330);
  ctx.strokeStyle = "#002266";
  ctx.lineWidth = 4;
  ctx.strokeRect(70, 150, W - 140, H - 330);

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffcc00";
  ctx.font = "bold 64px Arial, Helvetica, sans-serif";
  ctx.fillText("LEGAL OR BANNED?", 70, 100);
  ctx.fillStyle = "#ffffff";
  ctx.font = "26px Arial, Helvetica, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("Form SW-20/AI", W - 70, 100);

  ctx.textAlign = "left";
  ctx.fillStyle = "#445";
  ctx.font = "24px Arial, Helvetica, sans-serif";
  ctx.fillText("EUROCRAT ARCADE · CERTIFICATE OF REGULATORY INSTINCT", 110, 215);
  ctx.fillRect(110, 232, W - 220, 2);

  ctx.fillStyle = "#003399";
  ctx.font = "bold 200px Arial, Helvetica, sans-serif";
  ctx.fillText(String(s.score), 104, 440);
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "30px Arial, Helvetica, sans-serif";
  ctx.fillText(`${s.correct}/${s.total} verdicts correct · best streak ${s.bestStreak}`, 110, 500);

  ctx.font = "bold 50px Arial, Helvetica, sans-serif";
  let y = wrap(ctx, `“${s.title}”`, 110, 600, W - 220, 62);

  ctx.font = "italic 32px Arial, Helvetica, sans-serif";
  ctx.fillStyle = "#333";
  y = wrap(ctx, `Meanwhile: ${s.meanwhile.replace(/^During your round, /, "")}`, 110, y + 40, W - 220, 44);

  ctx.save();
  ctx.translate(W - 290, H - 330);
  ctx.rotate(-0.18);
  ctx.strokeStyle = "#b3122e";
  ctx.fillStyle = "#b3122e";
  ctx.lineWidth = 10;
  ctx.globalAlpha = 0.85;
  ctx.strokeRect(-200, -70, 400, 140);
  ctx.font = "bold 64px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(s.correct * 2 >= s.total ? "ADMISSIBLE" : "REFUSÉ", 0, 22);
  ctx.restore();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px Arial, Helvetica, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Can you beat the Commission?", 70, H - 100);
  ctx.fillStyle = "#ffcc00";
  ctx.font = "30px Arial, Helvetica, sans-serif";
  ctx.fillText(s.url.replace(/^https?:\/\//, ""), 70, H - 52);
  return c;
}

export async function shareCard(s: ShareInfo): Promise<"shared" | "downloaded" | "cancelled"> {
  const canvas = drawShareCard(s);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) return "cancelled";
  const file = new File([blob], "legal-or-banned.png", { type: "image/png" });
  const text = `I scored ${s.score} at Legal or Banned? — “${s.title}”. ${s.url}`;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text, title: "Legal or Banned?" });
      return "shared";
    } catch (err) {
      if ((err as Error).name === "AbortError") return "cancelled";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "legal-or-banned.png";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return "downloaded";
}
