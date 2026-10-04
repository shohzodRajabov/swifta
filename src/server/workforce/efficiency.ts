import "server-only";
import { db } from "@/lib/db";

export type Efficiency = {
  /** overall index (1 = company average), null when there is no data */
  index: number | null;
  sessions: number;
  hours: number;
  reliable: boolean;
  byWorkType: { workTypeId: string | null; index: number; sessions: number; hours: number; ratePerHour: number }[];
};

/**
 * Efficiency index per employee: quantity per person-hour in the sessions they took part in, compared with the
 * company average for the same work type. Uses the session rate (qty / total person-hours), so the result does
 * not depend on the contribution method chosen for each session.
 */
export async function efficiencyIndexes(companyId: string, employeeIds?: string[]): Promise<Map<string, Efficiency>> {
  const [company, sessions] = await Promise.all([
    db.company.findUniqueOrThrow({ where: { id: companyId }, select: { efficiencyMinSessions: true } }),
    db.workSession.findMany({
      where: { companyId, status: { not: "REJECTED" }, quantity: { gt: 0 } },
      select: {
        quantity: true,
        task: { select: { workTypeId: true } },
        members: { select: { employeeId: true, hours: true } },
      },
    }),
  ]);
  // company average per work type
  const avg = new Map<string, { qty: number; hours: number }>();
  for (const s of sessions) {
    const key = s.task.workTypeId ?? "-";
    const hours = s.members.reduce((x, m) => x + Number(m.hours), 0);
    if (hours <= 0) continue;
    const a = avg.get(key) ?? { qty: 0, hours: 0 };
    avg.set(key, { qty: a.qty + Number(s.quantity), hours: a.hours + hours });
  }
  const per = new Map<string, Map<string, { weighted: number; hours: number; sessions: number }>>();
  for (const s of sessions) {
    const key = s.task.workTypeId ?? "-";
    const total = s.members.reduce((x, m) => x + Number(m.hours), 0);
    if (total <= 0) continue;
    const rate = Number(s.quantity) / total;
    for (const m of s.members) {
      if (employeeIds && !employeeIds.includes(m.employeeId)) continue;
      const byType = per.get(m.employeeId) ?? new Map();
      const e = byType.get(key) ?? { weighted: 0, hours: 0, sessions: 0 };
      const h = Number(m.hours);
      byType.set(key, { weighted: e.weighted + rate * h, hours: e.hours + h, sessions: e.sessions + 1 });
      per.set(m.employeeId, byType);
    }
  }
  const out = new Map<string, Efficiency>();
  for (const [employeeId, byType] of per) {
    const list: Efficiency["byWorkType"] = [];
    let wSum = 0;
    let hSum = 0;
    let sCount = 0;
    for (const [key, v] of byType) {
      const a = avg.get(key)!;
      const avgRate = a.qty / a.hours;
      const empRate = v.weighted / v.hours;
      const index = avgRate > 0 ? empRate / avgRate : 1;
      list.push({ workTypeId: key === "-" ? null : key, index, sessions: v.sessions, hours: v.hours, ratePerHour: empRate });
      wSum += index * v.hours;
      hSum += v.hours;
      sCount += v.sessions;
    }
    out.set(employeeId, {
      index: hSum > 0 ? wSum / hSum : null,
      sessions: sCount,
      hours: hSum,
      reliable: sCount >= company.efficiencyMinSessions,
      byWorkType: list.sort((a, b) => b.hours - a.hours),
    });
  }
  return out;
}
