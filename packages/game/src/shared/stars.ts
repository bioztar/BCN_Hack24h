/** Ring of 12 five-pointed stars, drawn (not the official emblem image). */
function starPath(cx: number, cy: number, r: number): string {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.4 : r;
    d += `${i ? "L" : "M"}${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }
  return d + "Z";
}

export function starRingSvg(ringR = 40, starR = 5.2, color = "#ffcc00"): string {
  let d = "";
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    d += starPath(50 + ringR * Math.sin(a), 50 - ringR * Math.cos(a), starR);
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="${d}" fill="${color}"/></svg>`;
}

export function drawStarRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, ringR: number, starR: number, color = "#ffcc00"): void {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const x = cx + ringR * Math.sin(a);
    const y = cy - ringR * Math.cos(a);
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const b = -Math.PI / 2 + (k * Math.PI) / 5;
      const rr = k % 2 ? starR * 0.4 : starR;
      ctx.lineTo(x + rr * Math.cos(b), y + rr * Math.sin(b));
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
