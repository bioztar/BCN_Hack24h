import { formatEurFull, formatJail } from "./meter";
import { meanwhileLine } from "./meanwhile";
import { loadImage } from "./cutout";
import type { NoticeV2 } from "./types";

const S = 1080;

/** Client-drawn 1080² badge: the fallback when /api/case/:id/badge.png is missing (and the mock's badge). */
export async function drawBadge(n: NoticeV2, photoUrl: string | null): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0a1433";
  g.fillRect(0, 0, S, S);
  g.strokeStyle = "#ffd617";
  g.lineWidth = 14;
  g.strokeRect(30, 30, S - 60, S - 60);
  g.textAlign = "center";
  g.fillStyle = "#ffd617";
  g.font = "900 64px Arial";
  g.fillText("EUROCRAT", S / 2, 140);
  g.fillStyle = "#fff";
  g.font = "28px Arial";
  g.fillText("Notice of Non-Compliance · " + n.serial, S / 2, 190);

  const photo = photoUrl ? await loadImage(photoUrl) : null;
  let y = 260;
  if (photo) {
    g.save();
    g.beginPath();
    g.arc(S / 2, y + 110, 110, 0, Math.PI * 2);
    g.clip();
    const k = Math.max(220 / photo.naturalWidth, 220 / photo.naturalHeight);
    g.drawImage(photo, S / 2 - (photo.naturalWidth * k) / 2, y + 110 - (photo.naturalHeight * k) / 2, photo.naturalWidth * k, photo.naturalHeight * k);
    g.restore();
    y += 250;
  }
  g.fillStyle = "#fff";
  g.font = "bold 76px Arial";
  g.fillText(n.startupName.slice(0, 22), S / 2, y + 70);
  if (n.founderName) {
    g.font = "32px Arial";
    g.fillStyle = "#c9d3ee";
    g.fillText(`founded by ${n.founderName}`.slice(0, 48), S / 2, y + 120);
  }
  g.fillStyle = "#ffd617";
  g.font = "900 70px Arial";
  g.fillText(`${formatEurFull(n.totalEur)} fines`, S / 2, y + 230);
  g.fillText(`${formatJail(n.totalJailMonths)} in jail`, S / 2, y + 320);
  if (n.meanwhile) {
    g.font = "28px Arial";
    g.fillStyle = "#fff";
    g.fillText(`Meanwhile: ${meanwhileLine(n.meanwhile)}`.slice(0, 80), S / 2, y + 390);
  }
  const stamp = n.meltdown ? null : await loadImage("/assets/generated/cutout/stamp-refuse.png");
  g.save();
  g.translate(S / 2, S - 190);
  g.rotate(-0.12);
  if (stamp) {
    const k = Math.min(620 / stamp.naturalWidth, 220 / stamp.naturalHeight);
    g.drawImage(stamp, (-stamp.naturalWidth * k) / 2, (-stamp.naturalHeight * k) / 2, stamp.naturalWidth * k, stamp.naturalHeight * k);
  } else {
    g.strokeStyle = g.fillStyle = "rgba(220,30,50,0.92)";
  g.lineWidth = 12;
  g.strokeRect(-300, -75, 600, 150);
  g.font = "900 110px Arial";
  g.textBaseline = "middle";
  g.fillText(n.meltdown ? "MELTDOWN" : "REFUSÉ", 0, 6);
  }
  g.restore();
  g.fillStyle = "#c9d3ee";
  g.font = "26px Arial";
  g.fillText("eurocrat.pro7ocol.com/pocket — get refused too", S / 2, S - 50);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
}
