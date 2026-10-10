import QRCode from "qrcode";
import type { Notice, Persona } from "./types";

const W = 1080;
const H = 1350;

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > maxW && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function stampMark(g: CanvasRenderingContext2D, text: string, x: number, y: number, rot: number, size: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.font = `bold ${size}px Arial`;
  const w = g.measureText(text).width + size * 0.8;
  const h = size * 1.5;
  g.strokeStyle = "rgba(200,16,46,0.82)";
  g.fillStyle = "rgba(200,16,46,0.82)";
  g.lineWidth = size * 0.12;
  g.strokeRect(-w / 2, -h / 2, w, h);
  g.lineWidth = size * 0.04;
  g.strokeRect(-w / 2 + size * 0.15, -h / 2 + size * 0.15, w - size * 0.3, h - size * 0.3);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 0, size * 0.05);
  g.restore();
}

export function formatEur(n: number): string {
  return `€${Math.round(n).toLocaleString("en-GB")}`;
}

/** The compact Notice of Non-Compliance, drawn for sharing. */
export function drawNotice(notice: Notice, officers: Persona[], appUrl: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fbfaf4";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#003399";
  g.fillRect(0, 0, W, 210);
  g.fillStyle = "#ffcc00";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    star(g, 120 + Math.cos(a) * 62, 105 + Math.sin(a) * 62, 13);
  }
  g.fillStyle = "#fff";
  g.font = "bold 30px Arial";
  g.fillText("EUROCRAT COMMISSION · DG ROAST", 220, 82);
  g.font = "26px Arial";
  g.fillText("Pocket Annex · Unit C.4 (Pre-Conformity)", 220, 124);
  g.font = "22px Arial";
  g.fillText(`Form NNC-1 · Serial ${notice.serial}`, 220, 162);

  g.fillStyle = "#111";
  g.font = "bold 64px Arial";
  g.fillText("NOTICE OF", 70, 320);
  g.fillText("NON-COMPLIANCE", 70, 392);
  g.font = "28px Arial";
  g.fillStyle = "#444";
  g.fillText("Concerning the undertaking known as", 70, 456);
  g.fillStyle = "#003399";
  g.font = "bold 50px Arial";
  g.fillText(notice.startup.slice(0, 30), 70, 518);

  g.fillStyle = "#111";
  g.font = "bold 26px Arial";
  g.fillText("FINDINGS", 70, 590);
  let y = 634;
  g.font = "27px Arial";
  notice.findings.slice(0, 4).forEach((f, i) => {
    const lines = wrap(g, `${i + 1}. ${f.text}`, W - 140);
    for (const l of lines.slice(0, 2)) {
      g.fillStyle = "#222";
      g.fillText(l, 70, y);
      y += 36;
    }
    g.fillStyle = "#003399";
    g.font = "bold 22px Arial";
    g.fillText(`— ${f.provision.label}`, 100, y);
    g.font = "27px Arial";
    y += 46;
  });

  g.fillStyle = "#111";
  g.font = "bold 26px Arial";
  g.fillText("ADMINISTRATIVE FINE", 70, y + 14);
  g.fillStyle = "#c8102e";
  g.font = "bold 76px Arial";
  g.fillText(formatEur(notice.fineEur), 70, y + 94);
  g.fillStyle = "#555";
  g.font = "21px Arial";
  for (const [i, l] of wrap(g, notice.fineBasis, 620).slice(0, 3).entries()) g.fillText(l, 70, y + 134 + i * 28);

  const sigY = H - 150;
  g.strokeStyle = "#333";
  g.lineWidth = 2;
  officers.slice(0, 2).forEach((p, i) => {
    const x = 70 + i * 330;
    g.beginPath();
    g.moveTo(x, sigY);
    g.lineTo(x + 280, sigY);
    g.stroke();
    g.fillStyle = "#1a2b6d";
    g.font = "italic 34px 'Brush Script MT', cursive";
    g.fillText(p.name.split(" ").slice(-1)[0]!, x + 10, sigY - 12);
    g.fillStyle = "#333";
    g.font = "18px Arial";
    g.fillText(p.name.slice(0, 30), x, sigY + 28);
  });
  g.fillStyle = "#777";
  g.font = "18px Arial";
  g.fillText(`Issued ${new Date(notice.issuedAt).toISOString().slice(0, 10)} · Fictional officials, real citations · Satire`, 70, H - 50);

  const qr = QRCode.create(appUrl, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const qs = 210;
  const cell = qs / (n + 4);
  const qx = W - qs - 60;
  const qy = H - qs - 120;
  g.fillStyle = "#fff";
  g.fillRect(qx, qy, qs, qs);
  g.fillStyle = "#111";
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.modules.get(r, col)) g.fillRect(qx + (col + 2) * cell, qy + (r + 2) * cell, cell + 0.5, cell + 0.5);
  g.font = "bold 18px Arial";
  g.textAlign = "center";
  g.fillText("Get your own official", qx + qs / 2, qy + qs + 28);
  g.textAlign = "left";

  stampMark(g, "REFUSÉ", W - 250, 470, -0.2, 62);
  stampMark(g, "RENVOYÉ EN COMMISSION", W - 330, H - 470, 0.12, 30);
  return c;
}

export function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}
