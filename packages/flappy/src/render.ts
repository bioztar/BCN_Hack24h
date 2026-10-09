import { C, GROUND_Y, PILLAR_REGS, WORLD_H, gapY, sandboxed, type State } from "./logic";

export interface View {
  scale: number;
  viewW: number;
  birdSX: number;
}

const BLUE = "#003399";
const GOLD = "#ffcc00";
const INK = "#c8102e";
const PAPER = "#f4f2e8";

export function layout(cw: number, ch: number): View {
  const scale = ch / WORLD_H;
  const viewW = cw / scale;
  return { scale, viewW, birdSX: Math.max(90, Math.min(340, viewW * 0.28)) };
}

function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function background(g: CanvasRenderingContext2D, v: View, camX: number): void {
  const grd = g.createLinearGradient(0, 0, 0, GROUND_Y);
  grd.addColorStop(0, "#001f66");
  grd.addColorStop(1, "#0a47b8");
  g.fillStyle = grd;
  g.fillRect(0, 0, v.viewW, GROUND_Y);

  // far: office blocks with lit windows (parallax 0.25)
  const far = camX * 0.25;
  const bw = 90;
  const start = Math.floor(far / bw) - 1;
  for (let i = start; i < start + v.viewW / bw + 3; i++) {
    const h = 120 + hash(i) * 200;
    const x = i * bw - far;
    g.fillStyle = "#0b2a6e";
    g.fillRect(x, GROUND_Y - h, bw - 8, h);
    g.fillStyle = "rgba(255,204,0,0.18)";
    for (let wy = GROUND_Y - h + 12; wy < GROUND_Y - 10; wy += 18)
      for (let wx = 8; wx < bw - 18; wx += 16) if (hash(i * 977 + wy * 31 + wx) > 0.55) g.fillRect(x + wx, wy, 7, 9);
  }
  // mid: drifting forms (parallax 0.55)
  const mid = camX * 0.55;
  const fw = 160;
  const s2 = Math.floor(mid / fw) - 1;
  g.fillStyle = "rgba(255,255,255,0.10)";
  for (let i = s2; i < s2 + v.viewW / fw + 3; i++) {
    const x = i * fw - mid + hash(i + 5) * 60;
    const y = 40 + hash(i + 11) * (GROUND_Y - 220);
    g.save();
    g.translate(x, y);
    g.rotate((hash(i + 3) - 0.5) * 0.6);
    g.fillRect(0, 0, 26, 34);
    g.restore();
  }
}

function ground(g: CanvasRenderingContext2D, v: View, camX: number): void {
  g.fillStyle = "#001a66";
  g.fillRect(0, GROUND_Y, v.viewW, WORLD_H - GROUND_Y);
  g.fillStyle = GOLD;
  g.fillRect(0, GROUND_Y, v.viewW, 4);
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.font = "bold 13px Arial";
  const txt = "OFFICIAL JOURNAL OF THE EUROPEAN UNION · SERIES L · ";
  const tw = 420;
  const off = camX % tw;
  for (let x = -off; x < v.viewW; x += tw) g.fillText(txt, x, GROUND_Y + 30);
}

function pillar(g: CanvasRenderingContext2D, sx: number, top: number, bottom: number, short: string, art: string, moving: boolean): void {
  const w = C.pillarW;
  const x = sx - w / 2;
  g.fillStyle = PAPER;
  g.fillRect(x, 0, w, top);
  g.fillRect(x, bottom, w, GROUND_Y - bottom);
  g.strokeStyle = "rgba(0,51,153,0.22)";
  g.lineWidth = 1;
  g.beginPath();
  for (let y = top - 12; y > 0; y -= 12) {
    g.moveTo(x + 4, y);
    g.lineTo(x + w - 4, y);
  }
  for (let y = bottom + 12; y < GROUND_Y; y += 12) {
    g.moveTo(x + 4, y);
    g.lineTo(x + w - 4, y);
  }
  g.stroke();
  g.fillStyle = "rgba(0,0,0,0.12)";
  g.fillRect(x + w - 6, 0, 6, top);
  g.fillRect(x + w - 6, bottom, 6, GROUND_Y - bottom);

  const capH = 36;
  const cap = (y: number): void => {
    g.fillStyle = moving ? GOLD : BLUE;
    g.fillRect(x - 6, y, w + 12, capH);
    g.fillStyle = moving ? BLUE : GOLD;
    g.textAlign = "center";
    g.font = `bold ${short.length > 4 ? 13 : 15}px Arial`;
    g.fillText(short, sx, y + 16);
    g.fillStyle = moving ? "#111" : "#fff";
    g.font = "bold 11px Arial";
    g.fillText(art, sx, y + 30);
    g.textAlign = "left";
  };
  cap(top - capH);
  cap(bottom);
}

function rocket(g: CanvasRenderingContext2D, x: number, y: number, vy: number, sinceFlap: number, shield: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(Math.max(-0.5, Math.min(1.1, vy / 650)));
  const fl = sinceFlap < 160 ? 1 : 0.45;
  g.fillStyle = "#ff8a00";
  g.beginPath();
  g.moveTo(-14, -5);
  g.lineTo(-14 - 16 * fl - Math.random() * 4, 0);
  g.lineTo(-14, 5);
  g.fill();
  g.fillStyle = GOLD;
  g.beginPath();
  g.moveTo(-8, -6);
  g.lineTo(-16, -14);
  g.lineTo(-2, -6);
  g.moveTo(-8, 6);
  g.lineTo(-16, 14);
  g.lineTo(-2, 6);
  g.fill();
  g.fillStyle = "#fff";
  g.beginPath();
  g.ellipse(0, 0, 16, 8, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = INK;
  g.beginPath();
  g.moveTo(10, -6);
  g.quadraticCurveTo(22, 0, 10, 6);
  g.fill();
  g.fillStyle = BLUE;
  g.beginPath();
  g.arc(2, 0, 3.6, 0, Math.PI * 2);
  g.fill();
  g.restore();
  if (shield > 0) {
    const flicker = shield < 700 && Math.floor(shield / 90) % 2 === 0;
    if (!flicker) {
      g.strokeStyle = "#f2d38a";
      g.lineWidth = 3;
      g.setLineDash([6, 5]);
      g.beginPath();
      g.arc(x, y, 26, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
  }
}

function pickupSprite(g: CanvasRenderingContext2D, kind: "sandbox" | "delegated", x: number, y: number, t: number): void {
  const bob = Math.sin(t / 220 + x) * 4;
  g.save();
  g.translate(x, y + bob);
  if (kind === "sandbox") {
    g.fillStyle = "rgba(242,211,138,0.3)";
    g.beginPath();
    g.arc(0, 0, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(-11, -8);
    g.lineTo(11, -8);
    g.lineTo(8, 12);
    g.lineTo(-8, 12);
    g.closePath();
    g.fill();
    g.fillStyle = "#e8c77a";
    g.beginPath();
    g.ellipse(0, -8, 11, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#fff";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, -8, 10, Math.PI, 0);
    g.stroke();
    g.fillStyle = "#fff";
    g.font = "bold 10px Arial";
    g.textAlign = "center";
    g.fillText("SANDBOX", 0, 28);
  } else {
    g.rotate(Math.sin(t / 300) * 0.15);
    g.fillStyle = "rgba(255,204,0,0.25)";
    g.beginPath();
    g.arc(0, 0, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.fillRect(-11, -14, 22, 28);
    g.fillStyle = BLUE;
    g.fillRect(-11, -14, 22, 7);
    g.fillStyle = INK;
    g.font = "bold 11px Arial";
    g.textAlign = "center";
    g.fillText("DA", 0, 8);
    g.fillStyle = "#fff";
    g.font = "bold 10px Arial";
    g.fillText("DELEGATED ACT", 0, 30);
  }
  g.restore();
}

export function draw(g: CanvasRenderingContext2D, v: View, st: State, now: number, lastFlap: number, shake: number): void {
  g.save();
  g.scale(v.scale, v.scale);
  if (shake > 0) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  const camX = st.bird.x - v.birdSX;
  background(g, v, camX);
  for (const p of st.pillars) {
    const sx = p.x - camX;
    if (sx < -C.pillarW || sx > v.viewW + C.pillarW) continue;
    const cy = gapY(p, st.t);
    const reg = PILLAR_REGS[p.reg];
    pillar(g, sx, cy - p.gap / 2, cy + p.gap / 2, reg.short, reg.label.replace(/^(GDPR|AI Act|NIS2|DORA) /, ""), p.moveFrom !== null);
  }
  for (const k of st.pickups) {
    if (k.taken) continue;
    const sx = k.x - camX;
    if (sx > -40 && sx < v.viewW + 40) pickupSprite(g, k.kind, sx, k.y, now);
  }
  ground(g, v, camX);
  rocket(g, v.birdSX, st.bird.y, st.phase === "ready" ? 0 : st.bird.vy, now - lastFlap, sandboxed(st) ? st.sandboxUntil - st.t : 0);
  g.restore();
}
