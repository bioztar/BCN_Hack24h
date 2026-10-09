/** One normalised view of a published Notice (v1 or v2) for the badge and the PDF. */
import type { Meanwhile, Notice, NoticeV2, PersonaId, Provision } from "@dg-roast/shared";
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

export function normalise(caseId: string, notice: Notice | NoticeV2, officers: [ReportOfficer, ReportOfficer]): ReportData {
  const v2 = isV2(notice) ? notice : null;
  const tldr = v2?.tldr?.length
    ? v2.tldr.map((t) => ({ law: t.law, oneLine: t.oneLine, provisions: provisionsForLaw(t.law, notice.findings) }))
    : tldrFromFindings(notice.findings);
  return {
    caseId,
    serial: notice.serial,
    startupName: (v2?.startupName || notice.startup || "Unnamed Startup").trim(),
    founderName: v2?.founderName?.trim() || null,
    officers,
    totalEur: v2 ? v2.totalEur : notice.fineEur,
    totalJailMonths: v2 ? v2.totalJailMonths : 0,
    meltdown: v2?.meltdown ?? false,
    fineBasis: notice.fineBasis,
    issuedAt: notice.issuedAt,
    findings: notice.findings,
    tldr,
    recommendations: v2?.recommendations ?? [],
    meanwhile: v2?.meanwhile ?? null,
  };
}
