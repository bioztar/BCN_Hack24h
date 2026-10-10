/** The branded Notice as a PDF (pdfkit, pure JS): TL;DR page, analysis per provision, recommendations, annex. */
import { existsSync } from "node:fs";
import PDFDocument from "pdfkit";
import { FONT_FILES } from "./fonts.js";
import { formatDate, formatElapsed, formatEur, formatJail, pick, seeded } from "./format.js";
import { ASSESSMENTS, CLOSERS, frameworkOf, remedyFor } from "./law.js";
import type { ReportData } from "./model.js";
import type { Provision } from "@dg-roast/shared";

const NAVY = "#0b1f4d";
const GOLD = "#d4a514";
const GOLD_LIGHT = "#fff6d1";
const INK = "#1d2333";
const GREY = "#5d6578";
const RED = "#d8262c";
const ROW = "#eef1f8";
export const ANALYZER_URL = "https://warden.pro7ocol.com/analyze/";
export const PUBLIC_URL = "https://eurocrat.pro7ocol.com";

const M = 56;
const TOP = 118;
const BOTTOM = 64;

/** First ~n characters of the law's text, cut at a word boundary. */
export function excerpt(text: string | undefined, n = 520): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length < 40) return null;
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), n - 40)).replace(/[,;:(\s]+$/, "") + " …";
}

export interface PdfInput {
  report: ReportData;
  /** Full text of a provision from the corpus index, when available. */
  lawText?: (id: string) => string | undefined;
}

export function renderReport({ report: r, lawText }: PdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: TOP, bottom: BOTTOM, left: M, right: M },
    bufferPages: true,
    info: { Title: `Notice of Non-Compliance ${r.serial} — ${r.startupName}`, Author: "Eurocrat — DG ROAST (parody)", Subject: "Notice of Non-Compliance", Keywords: "parody, EU compliance, AI Act, GDPR" },
  });
  for (const [k, f] of Object.entries(FONT_FILES)) doc.registerFont(k, f);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const W = doc.page.width;
  /** Ellipsises to one line at the current font and size. */
  const fit = (text: string, width: number) => {
    if (doc.widthOfString(text) <= width) return text;
    let t = text;
    while (t.length > 1 && doc.widthOfString(`${t}…`) > width) t = t.slice(0, -1);
    return `${t.trimEnd()}…`;
  };
  const CW = W - 2 * M;
  const rand = seeded(r.caseId + r.serial);

  const letterhead = () => {
    const y0 = doc.y;
    doc.save();
    doc.rect(0, 0, W, 86).fill(NAVY);
    doc.rect(0, 86, W, 4).fill(GOLD);
    // Parody seal: a gold ring with a rubber stamp — deliberately not the EU emblem.
    doc.circle(M + 26, 43, 26).lineWidth(2.5).stroke(GOLD);
    doc.circle(M + 26, 43, 20).lineWidth(0.8).stroke(GOLD);
    doc.font("display").fontSize(15).fillColor(GOLD).text("DG", M + 6, 31, { width: 40, align: "center", lineBreak: false });
    doc.font("display").fontSize(28).fillColor(GOLD).text("EUROCRAT", M + 66, 16, { characterSpacing: 4, lineBreak: false });
    doc.font("sansBold").fontSize(7.5).fillColor("#c9d3ea").text("DIRECTORATE-GENERAL FOR REGULATORY ROASTING (DG ROAST)", M + 67, 56, { characterSpacing: 0.8, lineBreak: false });
    doc.font("sans").fontSize(7.5).fillColor("#c9d3ea");
    const right = ["Unit C.4 — Pre-Conformity & Refusals", "Rue de la Loi Imaginaire 200, B-1049 Bruxelles-ish", `Ref. ${r.serial}`];
    right.forEach((l, i) => doc.text(l, M, 24 + i * 11, { width: CW, align: "right", lineBreak: false }));
    doc.restore();
    doc.x = M;
    doc.y = Math.max(y0, TOP);
  };
  letterhead();
  doc.on("pageAdded", letterhead);

  const h1 = (t: string) => {
    doc.font("display").fontSize(20).fillColor(NAVY).text(t.toUpperCase(), M, doc.y, { characterSpacing: 1 });
    doc.moveTo(M, doc.y + 2).lineTo(M + CW, doc.y + 2).lineWidth(1.5).stroke(GOLD);
    doc.moveDown(0.8);
  };
  const h2 = (t: string) => {
    doc.font("sansBold").fontSize(10.5).fillColor(NAVY).text(t.toUpperCase(), M, doc.y, { characterSpacing: 1.2 });
    doc.moveDown(0.3);
  };
  const para = (label: string, body: string, font: "serif" | "serifItalic" = "serif") => {
    ensure(36);
    doc.font("serifBold").fontSize(10).fillColor(INK).text(`${label} `, M, doc.y, { continued: true, width: CW });
    doc.font(font).text(body, { width: CW, align: "justify" });
    doc.moveDown(0.35);
  };
  const ensure = (h: number) => {
    if (doc.y + h > doc.page.height - BOTTOM) doc.addPage();
  };
  const stamp = (cx: number, cy: number, scale: number, rot: number) => {
    doc.save();
    doc.opacity(0.85).rotate(rot, { origin: [cx, cy] });
    const w = 230 * scale;
    const h = 84 * scale;
    doc.roundedRect(cx - w / 2, cy - h / 2, w, h, 6 * scale).lineWidth(4 * scale).stroke(RED);
    doc.roundedRect(cx - w / 2 + 6 * scale, cy - h / 2 + 6 * scale, w - 12 * scale, h - 12 * scale, 3 * scale).lineWidth(1.2 * scale).stroke(RED);
    doc.font("display").fontSize(32 * scale).fillColor(RED).text("REFUSÉ", cx - w / 2, cy - h / 2 + 12 * scale, { width: w, align: "center", characterSpacing: 3 * scale, lineBreak: false });
    doc.font("display").fontSize(10 * scale).text("BANNED IN THE EU", cx - w / 2, cy + h / 2 - 26 * scale, { width: w, align: "center", characterSpacing: 3 * scale, lineBreak: false });
    doc.restore();
  };

  // ── Page 1: TL;DR ──
  doc.font("display").fontSize(26).fillColor(NAVY).text("NOTICE OF NON-COMPLIANCE", M, doc.y, { characterSpacing: 1.5 });
  doc.font("serifItalic").fontSize(10.5).fillColor(GREY).text("Decision of the Directorate refusing the applicant's existence in the internal market, with reasons, regrets (none) and annexes.", { width: CW });
  doc.moveDown(0.7);

  const meta: [string, string][] = [
    ["Applicant", r.startupName],
    ["Founder", r.founderName ?? "Not disclosed (noted in the file)"],
    ["Case officers", `${r.officers[0].name}; ${r.officers[1].name}`],
    ["Serial no.", r.serial],
    ["Issued", formatDate(r.issuedAt)],
    ["Case ID", r.caseId],
  ];
  const metaTop = doc.y;
  meta.forEach(([k, v], i) => {
    const y = metaTop + i * 14;
    doc.font("sansBold").fontSize(8.5).fillColor(GREY).text(k.toUpperCase(), M, y, { width: 90, lineBreak: false, characterSpacing: 0.6 });
    doc.font("serif").fontSize(10).fillColor(INK);
    doc.text(fit(v, CW - 92), M + 92, y - 1, { lineBreak: false });
  });
  doc.y = metaTop + meta.length * 14 + 10;

  h2("TL;DR — every law you broke");
  for (const [i, t] of r.tldr.entries()) {
    const lawW = 110;
    doc.font("serif").fontSize(10);
    const lineH = doc.heightOfString(t.oneLine, { width: CW - lawW - 16 });
    const provs = t.provisions.length ? t.provisions.join(" · ") : "";
    doc.font("sans").fontSize(7.5);
    const provH = provs ? doc.heightOfString(provs, { width: CW - lawW - 16 }) + 2 : 0;
    const h = Math.max(lineH + provH, 14) + 10;
    ensure(h);
    const y = doc.y;
    if (i % 2 === 0) doc.rect(M, y, CW, h).fill(ROW);
    doc.rect(M, y, 3, h).fill(GOLD);
    doc.font("sansBold").fontSize(10).fillColor(NAVY).text(t.law, M + 10, y + 5, { width: lawW - 10 });
    doc.font("serif").fontSize(10).fillColor(INK).text(t.oneLine, M + lawW + 6, y + 5, { width: CW - lawW - 16 });
    if (provs) doc.font("sans").fontSize(7.5).fillColor(GREY).text(provs, M + lawW + 6, y + 5 + lineH + 1, { width: CW - lawW - 16 });
    doc.y = y + h;
  }
  doc.moveDown(0.8);

  // Totals: v2 → meter total + per-law breakdown; v1 → the single fine and its basis.
  const rows = r.breakdown.length > 7 ? [...r.breakdown.slice(0, 6), r.breakdown.slice(6).reduce((a, b) => ({ law: "Other", eur: a.eur + b.eur, jailMonths: a.jailMonths + b.jailMonths }), { law: "Other", eur: 0, jailMonths: 0 })] : r.breakdown;
  const boxH = Math.max(r.v2 && !r.meltdown ? 80 : 92, 30 + rows.length * 13);
  ensure(boxH + 12);
  const ty = doc.y;
  const leftW = rows.length ? CW * 0.5 - 16 : CW - 32;
  doc.rect(M, ty, CW, boxH).fill(NAVY);
  doc.font("sansBold").fontSize(8.5).fillColor("#c9d3ea").text("TOTAL ADMINISTRATIVE FINES", M + 16, ty + 12, { characterSpacing: 1.2, lineBreak: false });
  doc.font("display").fontSize(28).fillColor("#ffd617").text(formatEur(r.totalEur), M + 16, ty + 24, { lineBreak: false });
  doc.font("sansBold").fontSize(10).fillColor("#ffffff").text(r.totalJailMonths > 0 ? `Custodial sentence: ${formatJail(r.totalJailMonths)}` : "Custodial sentence: none (the Directorate is disappointed)", M + 16, ty + 62, { lineBreak: false });
  const note = r.v2 ? (r.meltdown ? "Meltdown threshold reached: both officers combusted." : "") : `Basis: ${r.fineBasis}`;
  if (note) {
    doc.font("sans").fontSize(7).fillColor("#c9d3ea");
    doc.text(fit(note, leftW), M + 16, ty + 77, { lineBreak: false });
  }
  if (rows.length) {
    const bx = M + CW * 0.5;
    const bw = M + CW - 16 - bx;
    doc.moveTo(bx - 10, ty + 12).lineTo(bx - 10, ty + boxH - 12).lineWidth(0.6).stroke(GOLD);
    doc.font("sansBold").fontSize(7.5).fillColor("#c9d3ea").text("PER LAW", bx, ty + 12, { characterSpacing: 1.2, lineBreak: false });
    rows.forEach((b, k) => {
      const y = ty + 27 + k * 13;
      doc.font("sansBold").fontSize(8.5).fillColor("#ffffff");
      doc.text(fit(b.law, bw * 0.4), bx, y, { lineBreak: false });
      doc.font("sans").fontSize(8.5).fillColor("#ffd617");
      const amt = fit(formatEur(b.eur) + (b.jailMonths ? ` · ${formatJail(b.jailMonths)}` : ""), bw * 0.6);
      doc.text(amt, bx + bw - doc.widthOfString(amt), y, { lineBreak: false });
    });
  }
  doc.y = ty + boxH + 12;

  if (r.meanwhile) {
    const m = r.meanwhile;
    const n = (v: number, one: string, many: string) => `${v.toLocaleString("en-US")} ${v === 1 ? one : many}`;
    const text = `While you were being processed (${formatElapsed(m.elapsedSec)}), China built ${n(m.china.models, "new AI model", "new AI models")} — ${m.china.note}. The United States built ${m.us.models.toLocaleString("en-US")} ${m.us.note}. Europe adopted ${n(m.eu.regulations, "new regulation", "new regulations")} and ${n(m.eu.forms, "form", "forms")} you now have to fill in to start your startup — ${m.eu.note}.`;
    doc.font("serif").fontSize(10);
    const h = doc.heightOfString(text, { width: CW - 28 }) + 34;
    ensure(h + 6);
    const y = doc.y;
    doc.rect(M, y, CW, h).fillAndStroke(GOLD_LIGHT, GOLD);
    doc.font("sansBold").fontSize(8.5).fillColor(NAVY).text("MEANWHILE", M + 14, y + 10, { characterSpacing: 2 });
    doc.font("serif").fontSize(10).fillColor(INK).text(text, M + 14, y + 24, { width: CW - 28 });
    doc.y = y + h + 8;
  }
  ensure(30);
  doc.font("serifItalic").fontSize(8.5).fillColor(GREY).text("The detailed non-compliance analysis, the Directorate's recommendations and the annex of provisions follow. Reading them does not suspend the fine.", M, doc.y, { width: CW });

  const room = doc.page.height - BOTTOM - doc.y - 12;
  const scale = Math.min(1.9, (room - 16) / 116);
  if (doc.bufferedPageRange().count === 1 && scale >= 0.9) stamp(W / 2, doc.y + 12 + room / 2, scale, -8);
  else {
    const page = doc.bufferedPageRange().count - 1;
    const y = doc.y;
    doc.switchToPage(0);
    stamp(M + CW - 70, TOP + 14, 0.55, -10);
    doc.switchToPage(page);
    doc.y = y;
  }

  // ── Part I: analysis ──
  doc.addPage();
  h1("Part I — Detailed non-compliance analysis");
  doc.font("serif").fontSize(10).fillColor(INK).text(`The Directorate has examined the submission of ${r.startupName} against Union law and has identified the following ${r.findings.length === 1 ? "infringement" : `${r.findings.length} infringements`}. Each finding is grounded in a real provision; the officials are fictional, the law is not.`, { width: CW, align: "justify" });
  doc.moveDown(0.8);
  const assessments = [...ASSESSMENTS];
  const usable = doc.page.height - TOP - BOTTOM;
  const paraH = (label: string, body: string) => doc.font("serif").fontSize(10).heightOfString(`${label} ${body}`, { width: CW, align: "justify" }) + 6;
  r.findings.forEach((f, i) => {
    const fw = frameworkOf(f.provision);
    const law = excerpt(lawText?.(f.provision.id));
    const a = assessments.length ? assessments.splice(Math.floor(rand() * assessments.length), 1)[0]! : pick(ASSESSMENTS, rand);
    const title = `${i + 1}. ${f.provision.label} — ${f.provision.title}`;
    const blockH =
      doc.font("serifBold").fontSize(12).heightOfString(title, { width: CW }) + 16 +
      paraH("Finding of fact.", f.text) + (law ? paraH("The law.", `“${law}”`) : 0) +
      paraH("Assessment of the Directorate.", a) + paraH("Exposure.", fw.penalty) + paraH("Remedy.", remedyFor(f.provision)) + 24;
    ensure(Math.min(blockH, usable * 0.6));
    doc.font("serifBold").fontSize(12).fillColor(NAVY).text(title, M, doc.y, { width: CW });
    doc.font("sans").fontSize(7.5).fillColor(GREY).text(fw.name, { width: CW });
    doc.moveDown(0.3);
    para("Finding of fact.", f.text);
    if (law) para("The law.", `“${law}”`, "serifItalic");
    para("Assessment of the Directorate.", a);
    para("Exposure.", fw.penalty);
    para("Remedy.", remedyFor(f.provision));
    ensure(14);
    doc.font("sans").fontSize(8).fillColor("#1f4fb4").text(f.provision.url, { width: CW, link: f.provision.url, underline: true });
    doc.moveDown(0.9);
  });

  // ── Part II: recommendations ──
  doc.addPage();
  h1("Part II — Recommendations");
  doc.font("serifItalic").fontSize(10.5).fillColor(GREY).text("How to adjust the idea so that it may one day be lawfully refused for other reasons.", { width: CW });
  doc.moveDown(0.6);
  const recs: { text: string; provision?: Provision }[] = [...r.recommendations];
  const covered = new Set(recs.map((x) => x.provision?.id).filter(Boolean));
  for (const f of r.findings) {
    if (covered.has(f.provision.id)) continue;
    covered.add(f.provision.id);
    recs.push({ text: remedyFor(f.provision), provision: f.provision });
  }
  recs.forEach((rec, i) => {
    ensure(40);
    const y = doc.y;
    doc.font("display").fontSize(14).fillColor(GOLD).text(String(i + 1).padStart(2, "0"), M, y, { width: 26 });
    doc.font("serif").fontSize(10.5).fillColor(INK).text(rec.text, M + 30, y + 1, { width: CW - 30, align: "justify" });
    if (rec.provision) doc.font("sans").fontSize(7.5).fillColor(GREY).text(`${rec.provision.label} — ${rec.provision.title}`, M + 30, doc.y + 1, { width: CW - 30 });
    doc.moveDown(0.7);
  });
  const frameworks = [...new Map(r.findings.map((f) => [frameworkOf(f.provision).key, frameworkOf(f.provision)])).values()];
  if (frameworks.length) {
    ensure(60);
    doc.moveDown(0.4);
    h2("General hygiene, per regime");
    for (const fw of frameworks) {
      ensure(40);
      para(`${fw.short}${fw.binding ? "" : " (voluntary)"}.`, fw.remedy);
    }
  }
  ensure(46);
  doc.moveDown(0.4);
  doc.font("serifBold").fontSize(10).fillColor(NAVY).text("Want the serious version? ", M, doc.y, { continued: true, width: CW });
  doc.font("serif").fillColor(INK).text("Run your idea, document or repository through the real analyzer at ", { continued: true });
  doc.fillColor("#1f4fb4").text(ANALYZER_URL, { link: ANALYZER_URL, underline: true, continued: true });
  doc.fillColor(INK).text(" — same citations, fewer stamps.", { underline: false });

  // Signatures
  ensure(150);
  doc.moveDown(1.2);
  const sy = doc.y;
  r.officers.forEach((o, i) => {
    const x = M + i * (CW / 2);
    if (o.cutout && existsSync(o.cutout)) {
      try {
        doc.image(o.cutout, x, sy, { height: 70 });
      } catch {
        /* unreadable cut-out: signature without the portrait */
      }
    }
    doc.save();
    doc.font("serifItalic").fontSize(20).fillColor("#2b3f86").text(o.name.split(" ").at(-1) ?? o.name, x + 60, sy + 22, { width: CW / 2 - 70, lineBreak: false });
    doc.restore();
    doc.moveTo(x + 60, sy + 50).lineTo(x + CW / 2 - 16, sy + 50).lineWidth(0.6).stroke(GREY);
    doc.font("sansBold").fontSize(8.5).fillColor(INK).text(o.name, x + 60, sy + 54, { width: CW / 2 - 70 });
    doc.font("sans").fontSize(7.5).fillColor(GREY).text(o.title, x + 60, doc.y, { width: CW / 2 - 70 });
  });
  doc.y = sy + 96;
  doc.font("serifItalic").fontSize(9).fillColor(GREY).text(pick(CLOSERS, rand), M, doc.y, { width: CW, align: "center" });

  // ── Annex ──
  doc.addPage();
  h1("Annex — Provisions cited");
  const cited = [...new Map([...r.findings.map((f) => f.provision), ...r.recommendations.flatMap((x) => (x.provision ? [x.provision] : []))].map((p) => [p.id, p])).values()];
  for (const p of cited) {
    ensure(34);
    doc.font("sansBold").fontSize(9.5).fillColor(NAVY).text(`${p.label} — `, M, doc.y, { continued: true, width: CW });
    doc.font("serif").fillColor(INK).text(p.title);
    doc.font("sans").fontSize(7.5).fillColor("#1f4fb4").text(p.url, { link: p.url, underline: true, width: CW });
    doc.moveDown(0.5);
  }
  doc.moveDown(0.8);
  doc.font("serifItalic").fontSize(8.5).fillColor(GREY).text(`Share your refusal: ${PUBLIC_URL}/api/case/${encodeURIComponent(r.caseId)}/badge.png`, { width: CW });

  // Footers on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - 44;
    doc.moveTo(M, fy - 6).lineTo(W - M, fy - 6).lineWidth(0.5).stroke(GOLD);
    doc.font("sans").fontSize(7).fillColor(GREY);
    doc.text(fit(`Ref. ${r.serial} · ${r.startupName}`, CW / 2 - 12), M, fy, { lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, M + CW / 2, fy, { width: CW / 2, align: "right", lineBreak: false });
    doc.text("Parody by Eurocrat (eurocrat.pro7ocol.com). Fictional officials, real citations. Not legal advice. Not affiliated with, or endorsed by, any EU institution.", M, fy + 11, { width: CW, align: "center", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}
