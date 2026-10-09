import { formatEurFull, formatJail } from "./meter";
import { meanwhileRows } from "./meanwhile";
import type { NoticeV2 } from "./types";

// Tiny text-only PDF writer for the mock report (the real report is the server's /report.pdf).

const ascii = (s: string) => s.replace(/€/g, "EUR ").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[—–]/g, "-").replace(/[^\x20-\x7e]/g, "");
const esc = (s: string) => ascii(s).replace(/[\\()]/g, (c) => `\\${c}`);

function wrap(s: string, n = 88): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of ascii(s).split(/\s+/)) {
    if ((line + " " + w).trim().length > n && line) {
      out.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

export function reportLines(n: NoticeV2): { text: string; size: number }[] {
  const L: { text: string; size: number }[] = [];
  const h = (t: string) => L.push({ text: t, size: 16 }, { text: "", size: 6 });
  const p = (t: string) => wrap(t).forEach((x) => L.push({ text: x, size: 11 }));
  L.push({ text: "EUROCRAT - Notice of Non-Compliance", size: 22 }, { text: `${n.serial} - ${n.startupName}${n.founderName ? ` (${n.founderName})` : ""}`, size: 12 }, { text: "", size: 10 });
  h("TL;DR");
  p(`Total fines: ${formatEurFull(n.totalEur)}. Jail: ${formatJail(n.totalJailMonths)}.${n.meltdown ? " Both officers melted down." : ""}`);
  n.tldr.forEach((t) => p(`- ${t.law}: ${t.oneLine}`));
  if (n.meanwhile) {
    L.push({ text: "", size: 8 });
    p("While you were being processed:");
    meanwhileRows(n.meanwhile).forEach((r) => p(`  ${r.who} ${r.text}`));
  }
  L.push({ text: "", size: 10 });
  h("Findings");
  n.findings.forEach((f) => p(`- ${f.provision.label} (${f.provision.title}): ${f.text}`));
  L.push({ text: "", size: 10 });
  h("How to adjust the idea");
  n.recommendations.forEach((r) => p(`- ${r.text}${r.provision ? ` [${r.provision.label}]` : ""}`));
  L.push({ text: "", size: 10 }, { text: "Mock report (no server). Satire - not legal advice.", size: 9 });
  return L;
}

export function buildReportPdf(n: NoticeV2): Blob {
  const lines = reportLines(n);
  const pages: string[] = [];
  let y = 800;
  let cur = "";
  for (const l of lines) {
    if (y < 50) {
      pages.push(cur);
      cur = "";
      y = 800;
    }
    if (l.text) cur += `BT /F1 ${l.size} Tf 50 ${y} Td (${esc(l.text)}) Tj ET\n`;
    y -= l.size + 5;
  }
  pages.push(cur);
  const objs: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((content, i) => {
    objs[4 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objs[5 + i * 2] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([out], { type: "application/pdf" });
}
