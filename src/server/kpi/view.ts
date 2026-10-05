import "server-only";
import type { KpiSubject } from "@prisma/client";
import { db } from "@/lib/db";
import type { RuleComponent, SnapshotComponent } from "@/lib/kpi";
import { computeSubject, ruleFor, sortResults, type SubjectResult } from "./compute";

export type KpiTable = {
  period: { id: string; status: "CALCULATED" | "APPROVED"; calculatedAt: Date; approvedAt: Date | null } | null;
  rule: { id: string; name: string; version: number; components: RuleComponent[] } | null;
  rows: SubjectResult[];
  /** true = not saved yet, computed on the fly from current data */
  live: boolean;
};

/** Saved snapshots of a month, or a live preview when the month has not been calculated yet. */
export async function kpiTable(companyId: string, subject: KpiSubject, month: string): Promise<KpiTable> {
  const period = await db.kpiPeriod.findUnique({
    where: { companyId_month_subject: { companyId, month, subject } },
    include: {
      rule: true,
      snapshots: { include: { employee: { select: { fullName: true } }, group: { select: { name: true } }, contractor: { select: { name: true } } }, orderBy: { score: "desc" } },
    },
  });
  if (period) {
    return {
      period,
      rule: { id: period.rule.id, name: period.rule.name, version: period.rule.version, components: period.rule.components as RuleComponent[] },
      rows: sortResults(period.snapshots.map((s) => ({
        id: (s.employeeId ?? s.groupId ?? s.contractorId)!,
        name: s.employee?.fullName ?? s.group?.name ?? s.contractor?.name ?? "—",
        score: Number(s.score),
        components: s.components as SnapshotComponent[],
      }))),
      live: false,
    };
  }
  const rule = await ruleFor(db, companyId, subject, month);
  if (!rule) return { period: null, rule: null, rows: [], live: true };
  const rows = (await computeSubject(db, companyId, subject, month, rule.components as RuleComponent[])).filter((r) => r.score !== null);
  return { period: null, rule: { id: rule.id, name: rule.name, version: rule.version, components: rule.components as RuleComponent[] }, rows, live: true };
}

/** One subject's monthly scores for the last `months` months (saved snapshots only). */
export async function kpiHistory(companyId: string, subject: KpiSubject, id: string, months = 6) {
  const field = subject === "EMPLOYEE" ? "employeeId" : subject === "GROUP" ? "groupId" : "contractorId";
  const rows = await db.kpiSnapshot.findMany({
    where: { [field]: id, period: { companyId, subject } },
    include: { period: { select: { month: true, status: true } } },
    orderBy: { period: { month: "desc" } },
    take: months,
  });
  return rows.map((r) => ({ month: r.period.month, status: r.period.status, score: Number(r.score) }));
}
