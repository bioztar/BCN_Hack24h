/** One normalised view of a published Notice (v1 or v2) for the badge and the PDF. */
import type { Meanwhile, Notice, NoticeV2, PersonaId, Provision } from "@dg-roast/shared";
import { printable } from "./glyphs.js";
import { frameworkOf } from "./law.js";

export interface ReportOfficer {
  id: PersonaId;
  name: string;
  title: string;
  /** Absolute path of a transparent cut-out on disk, or null (silhouette). */
  cutout: string | null;
}

export interface ReportData {
  caseId: string;
  serial: string;
  startupName: string;
  founderName: string | null;
  officers: [ReportOfficer, ReportOfficer];
  totalEur: number;
  totalJailMonths: number;
  meltdown: boolean;
  fineBasis: string;
  issuedAt: string;
  findings: { text: string; provision: Provision }[];
  tldr: { law: string; oneLine: string; provisions: string[] }[];
  recommendations: { text: string; provision?: Provision }[];
  meanwhile: Meanwhile | null;
  /** v2 notices: totals come from the fines meter; v1: a single fine with its legal basis. */
  v2: boolean;
  /** Per-law sums of the fines meter, largest first; empty when unknown. */
  breakdown: { law: string; eur: number; jailMonths: number }[];
}

/** A fines-meter item (server CaseState.meter.items). */
export interface FineLike {
  law: string;
  amountEur: number;
  jailMonths: number;
}

export function breakdown(fines: FineLike[] | undefined): ReportData["breakdown"] {
  const by = new Map<string, { law: string; eur: number; jailMonths: number }>();
  for (const f of fines ?? []) {
    const law = printable(f.law) || "Other";
    const b = by.get(law) ?? { law, eur: 0, jailMonths: 0 };
    b.eur += Number.isFinite(f.amountEur) ? f.amountEur : 0;
    b.jailMonths += Number.isFinite(f.jailMonths) ? f.jailMonths : 0;
    by.set(law, b);
  }
  return [...by.values()].sort((a, b) => b.eur - a.eur || b.jailMonths - a.jailMonths);
}

const isV2 = (n: Notice): n is NoticeV2 => typeof (n as NoticeV2).totalEur === "number";

/** Groups findings by framework: "GDPR" → "Art. 9 — Biometric fridge; Art. 6 — No lawful basis". */
export function tldrFromFindings(findings: Notice["findings"]): ReportData["tldr"] {
  const groups = new Map<string, { law: string; parts: string[]; provisions: string[] }>();
  for (const f of findings) {
    const fw = frameworkOf(f.provision);
    const g = groups.get(fw.short) ?? { law: fw.short, parts: [], provisions: [] };
    g.parts.push(f.text.replace(/\s+/g, " ").trim().replace(/\.$/, ""));
    g.provisions.push(f.provision.label);
    groups.set(fw.short, g);
  }
  return [...groups.values()].map((g) => ({ law: g.law, oneLine: g.parts.join("; ") + ".", provisions: g.provisions }));
}

/** Labels of the findings whose framework matches a TL;DR row's law ("GDPR", "AI Act", …). */
function provisionsForLaw(law: string, findings: Notice["findings"]): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return findings.filter((f) => {
    const fw = frameworkOf(f.provision);
    return norm(law).includes(norm(fw.short)) || norm(fw.short).includes(norm(law)) || norm(fw.name).includes(norm(law));
  }).map((f) => f.provision.label);
}

export function normalise(caseId: string, notice: Notice | NoticeV2, officers: [ReportOfficer, ReportOfficer], fines?: FineLike[]): ReportData {
  const v2 = isV2(notice) ? notice : null;
  const P = (t: string) => printable(t);
  const findings = notice.findings.map((f) => ({ text: P(f.text), provision: f.provision }));
  const tldr = v2?.tldr?.length
    ? v2.tldr.map((t) => ({ law: P(t.law), oneLine: P(t.oneLine), provisions: provisionsForLaw(t.law, notice.findings) }))
    : tldrFromFindings(findings);
  const m = v2?.meanwhile;
  return {
    caseId,
    serial: notice.serial,
    startupName: P(v2?.startupName || notice.startup || "") || "Unnamed Startup",
    founderName: (v2?.founderName && P(v2.founderName)) || null,
    officers: officers.map((o) => ({ ...o, name: P(o.name), title: P(o.title) })) as [ReportOfficer, ReportOfficer],
    totalEur: v2 ? v2.totalEur : notice.fineEur,
    totalJailMonths: v2 ? v2.totalJailMonths : 0,
    meltdown: v2?.meltdown ?? false,
    fineBasis: P(notice.fineBasis),
    issuedAt: notice.issuedAt,
    findings,
    tldr,
    recommendations: (v2?.recommendations ?? []).map((r) => ({ ...r, text: P(r.text) })),
    meanwhile: m ? { ...m, china: { ...m.china, note: P(m.china.note) }, us: { ...m.us, note: P(m.us.note) }, eu: { ...m.eu, note: P(m.eu.note) } } : null,
    v2: Boolean(v2),
    breakdown: v2 ? breakdown(fines) : [],
  };
}
