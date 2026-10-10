import { lawOf } from "./fines";
import { formatEurShort } from "./meter";
import type { FineEvent, Meanwhile, Notice, NoticeV2, TurnoverEstimate } from "./types";

/** "Estimated turnover (by the Commission, generously): €40 M — EU HR-tech TAM €8 bn × 0.5 %" */
export function turnoverLine(t: TurnoverEstimate | undefined): string | null {
  if (!t || !Number.isFinite(t.eur) || t.eur < 0) return null;
  const amount = formatEurShort(t.eur).replace(/\.0 /, " ");
  const basis = (t.basis ?? "").trim();
  return `Estimated turnover (by the Commission, generously): ${amount}${basis ? ` — ${basis}` : ""}`;
}

export function isNoticeV2(n: Notice): n is NoticeV2 {
  const v = n as Partial<NoticeV2>;
  return typeof v.totalEur === "number" && Array.isArray(v.tldr) && Array.isArray(v.recommendations);
}

/** Upgrades a v1 notice (older server) to the v2 shape, using what the stream told us. */
export function toNoticeV2(
  n: Notice,
  ctx: { caseId: string | null; fines: FineEvent[]; totalEur: number; totalJailMonths: number; meltdown: boolean; meanwhile: Meanwhile | null; applicantId?: string | null; founderName?: string | null; startupName?: string | null },
): NoticeV2 {
  const caseUrl = (f: string) => (ctx.caseId ? `/api/case/${encodeURIComponent(ctx.caseId)}/${f}` : "");
  if (isNoticeV2(n)) {
    return {
      ...n,
      totalEur: Math.max(n.totalEur, ctx.totalEur),
      totalJailMonths: Math.max(n.totalJailMonths, ctx.totalJailMonths),
      meltdown: n.meltdown || ctx.meltdown,
      badgeUrl: n.badgeUrl || caseUrl("badge.png"),
      reportUrl: n.reportUrl || caseUrl("report.pdf"),
      meanwhile: n.meanwhile ?? ctx.meanwhile ?? undefined,
    };
  }
  const laws = [...new Set([...ctx.fines.map((f) => f.provision.label), ...n.findings.map((f) => f.provision.label)].map(lawOf))];
  return {
    ...n,
    applicantId: ctx.applicantId ?? null,
    startupName: ctx.startupName || n.startup,
    founderName: ctx.founderName ?? null,
    totalEur: Math.max(ctx.totalEur, n.fineEur),
    totalJailMonths: ctx.totalJailMonths,
    meltdown: ctx.meltdown,
    tldr: laws.map((law) => ({ law, oneLine: n.findings.find((f) => lawOf(f.provision.label) === law)?.text ?? "Non-compliant." })),
    recommendations: [],
    reportUrl: caseUrl("report.pdf"),
    badgeUrl: caseUrl("badge.png"),
    meanwhile: ctx.meanwhile ?? undefined,
  };
}
