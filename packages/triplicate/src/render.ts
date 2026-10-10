import { DGS, type FormDef } from "./forms";
import { accepts, canFall, currentInterval, landingRows, type Game, type PieceCell } from "./game";
import { COLS, ROWS } from "./rules";

export interface View {
  cw: number;
  ch: number;
  ox: number;
  oy: number;
  dpr: number;
  /** Smoothed piece x for rendering. */
  px: number;
  flashes: { row: number; t0: number }[];
  shakeUntil: number;
  born: Map<number, number>;
}

export const newView = (): View => ({ cw: 0, ch: 0, ox: 0, oy: 0, dpr: 1, px: 1, flashes: [], shakeUntil: 0, born: new Map() });

/** Fit a 3×10 board of portrait-ish "forms" into the canvas. */
export function layout(view: View, canvas: HTMLCanvasElement): void {
  const rect = canvas.parentElement!.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const ch = Math.floor(rect.height / ROWS);
  const cw = Math.floor(Math.min(rect.width / COLS, ch * 1.65));
  const w = cw * COLS;
  const h = ch * ROWS;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  Object.assign(view, { cw, ch, ox: 0, oy: 0, dpr });
}

const dgColor = (f: FormDef): string => (f.dg ? DGS.find((d) => d.id === f.dg)!.color : "#ffcc00");

function fitText(x: CanvasRenderingContext2D, text: string, max: number, size: number, weight = "bold"): void {
  let s = size;
  x.font = `${weight} ${s}px Arial`;
  while (s > 8 && x.measureText(text).width > max) {
    s -= 1;
    x.font = `${weight} ${s}px Arial`;
  }
}

export function drawForm(
  x: CanvasRenderingContext2D, f: FormDef, px: number, py: number, w: number, h: number, junk: boolean, scale = 1,
): void {
  const pad = Math.max(2, Math.round(w * 0.035));
  x.save();
  x.translate(px + w / 2, py + h / 2);
  x.scale(scale, scale);
  const bw = w - pad * 2;
  const bh = h - pad * 2;
  const l = -bw / 2;
  const t = -bh / 2;
  const fold = Math.min(bw, bh) * 0.2;
  // shadow
  x.fillStyle = "rgba(0,0,20,0.35)";
  x.fillRect(l + 2, t + 3, bw, bh);
  // paper with folded corner
  x.beginPath();
  x.moveTo(l, t);
  x.lineTo(l + bw - fold, t);
  x.lineTo(l + bw, t + fold);
  x.lineTo(l + bw, t + bh);
  x.lineTo(l, t + bh);
  x.closePath();
  x.fillStyle = junk ? "#a3a8ae" : f.kind === "omnibus" ? "#fff6cc" : "#fbfaf4";
  x.fill();
  x.save();
  x.clip();
  const band = Math.max(5, bh * 0.2);
  if (f.kind === "wild" && !junk) {
    for (let i = -2; i < bw / 8 + 2; i++) {
      x.fillStyle = i % 2 ? "#ffcc00" : "#111";
      x.beginPath();
      x.moveTo(l + i * 8, t);
      x.lineTo(l + i * 8 + 8, t);
      x.lineTo(l + i * 8 + 8 - band, t + band);
      x.lineTo(l + i * 8 - band, t + band);
      x.fill();
    }
  } else {
    x.fillStyle = junk ? "#70757b" : f.kind === "omnibus" ? "#ffcc00" : dgColor(f);
    x.fillRect(l, t, bw, band);
  }
  // ruled lines
  x.fillStyle = junk ? "rgba(0,0,0,0.12)" : "rgba(0,51,153,0.12)";
  for (let ly = t + band + bh * 0.62; ly < t + bh - 3; ly += Math.max(4, bh * 0.1)) x.fillRect(l + bw * 0.12, ly, bw * 0.76, 1);
  x.restore();
  // fold triangle
  x.fillStyle = junk ? "#8a8f95" : "#d9d6c8";
  x.beginPath();
  x.moveTo(l + bw - fold, t);
  x.lineTo(l + bw - fold, t + fold);
  x.lineTo(l + bw, t + fold);
  x.closePath();
  x.fill();
  // code
  x.fillStyle = junk ? "#3a3d40" : "#111";
  x.textAlign = "center";
  x.textBaseline = "middle";
  fitText(x, f.code, bw * 0.86, Math.round(bh * 0.34));
  x.fillText(f.code, 0, t + band + (bh - band) * 0.36);
  const sub = f.label ?? (f.kind === "wild" ? "ANY INBOX" : f.kind === "omnibus" ? "SIMPLIFICATION" : "");
  if (sub && bh > 34) {
    x.fillStyle = junk ? "#3a3d40" : "#444";
    fitText(x, sub, bw * 0.86, Math.round(bh * 0.15), "normal");
    x.fillText(sub, 0, t + band + (bh - band) * 0.72);
  }
  if (junk) {
    x.save();
    x.rotate(-0.28);
    x.strokeStyle = "#c8102e";
    x.fillStyle = "#c8102e";
    x.lineWidth = 2;
    fitText(x, "RENVOYÉ", bw * 0.8, Math.round(bh * 0.26));
    const tw = x.measureText("RENVOYÉ").width;
    x.strokeRect(-tw / 2 - 4, -bh * 0.17, tw + 8, bh * 0.34);
    x.fillText("RENVOYÉ", 0, 1);
    x.restore();
  }
  x.restore();
}

export function drawBoard(x: CanvasRenderingContext2D, g: Game, v: View, now: number): void {
  const { cw, ch, dpr } = v;
  const W = cw * COLS;
  const H = ch * ROWS;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, W, H);
  if (now < v.shakeUntil) {
    const k = (v.shakeUntil - now) / 260;
    x.translate((Math.random() - 0.5) * 8 * k, (Math.random() - 0.5) * 5 * k);
  }
  // lanes
  for (let c = 0; c < COLS; c++) {
    x.fillStyle = c % 2 ? "#00297a" : "#002266";
    x.fillRect(c * cw, 0, cw, H);
    x.fillStyle = DGS[c]!.color;
    x.globalAlpha = 0.09;
    x.fillRect(c * cw, 0, cw, H);
    x.globalAlpha = 1;
  }
  x.fillStyle = "rgba(255,255,255,0.05)";
  for (let r = 1; r < ROWS; r++) x.fillRect(0, r * ch, W, 1);
  // danger line
  const tall = g.grid[2]!.some(Boolean);
  x.fillStyle = tall ? `rgba(200,16,46,${0.25 + 0.15 * Math.sin(now / 120)})` : "rgba(200,16,46,0.25)";
  x.fillRect(0, 0, W, 3);

  // settled forms
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const cell = g.grid[r]![c];
      if (!cell) continue;
      let b = v.born.get(cell.uid);
      if (b === undefined) v.born.set(cell.uid, (b = now));
      const age = now - b;
      const s = age < 140 ? 1.12 - 0.12 * (age / 140) : 1;
      drawForm(x, cell.form, c * cw, r * ch, cw, ch, cell.junk, s);
    }

  // flashes for cleared rows
  v.flashes = v.flashes.filter((f) => now - f.t0 < 450);
  for (const f of v.flashes) {
    const a = 1 - (now - f.t0) / 450;
    x.fillStyle = `rgba(255,214,23,${0.8 * a})`;
    x.fillRect(0, f.row * ch, W, ch);
  }

  const p = g.piece;
  if (!p || g.over) return;
  v.px += (p.x - v.px) * 0.45;
  if (Math.abs(p.x - v.px) < 0.01) v.px = p.x;

  // ghost: where each form will land, ✓/✗ for its inbox
  for (const { cell, col, row } of landingRows(g.grid, p)) {
    if (row < 0) continue;
    const ok = accepts(col, cell.form);
    x.strokeStyle = ok ? "rgba(95,208,104,0.9)" : "rgba(255,90,90,0.9)";
    x.setLineDash([6, 5]);
    x.lineWidth = 2;
    x.strokeRect(col * cw + 5, row * ch + 5, cw - 10, ch - 10);
    x.setLineDash([]);
    x.fillStyle = ok ? "rgba(95,208,104,0.9)" : "rgba(255,90,90,0.95)";
    x.font = `bold ${Math.round(ch * 0.42)}px Arial`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(ok ? "✓" : "✗", col * cw + cw / 2, row * ch + ch / 2);
  }

  const frac = canFall(g) ? Math.min(1, g.dropAcc / currentInterval(g)) : 0;
  const py = p.y + frac;
  for (const c of p.cells) {
    const yy = (py + c.dy) * ch;
    if (yy + ch <= 0) continue;
    drawForm(x, c.form, (v.px + c.dx) * cw, yy, cw, ch, false, 1.04);
  }
}

/** Small "next" preview. */
export function drawNext(canvas: HTMLCanvasElement, cells: PieceCell[] | undefined): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const x = canvas.getContext("2d")!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, W, H);
  if (!cells) return;
  const w = Math.max(...cells.map((c) => c.dx)) + 1;
  const h = Math.max(...cells.map((c) => c.dy)) + 1;
  const cw = Math.min(W / w, (H / h) * 1.6);
  const ch = Math.min(H / h, cw / 1.4);
  const ox = (W - cw * w) / 2;
  const oy = (H - ch * h) / 2;
  for (const c of cells) drawForm(x, c.form, ox + c.dx * cw, oy + c.dy * ch, cw, ch, false);
}
