import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  DEFAULT_RATING_WEIGHTS,
  DEFAULT_RELIABILITY_WEIGHTS,
  normalizeWeights,
  scoreContractor,
  smoothScores,
  type ContractorScoreResult,
  type OutsourceFact,
} from "@/lib/contractor-score";

type Db = typeof db | Prisma.TransactionClient;

export async function scoreWeights(companyId: string, tx: Db = db) {
  const c = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { contractorRatingConfig: true, contractorReliabilityConfig: true } });
  return {
    rating: normalizeWeights(c.contractorRatingConfig, DEFAULT_RATING_WEIGHTS),
    reliability: normalizeWeights(c.contractorReliabilityConfig, DEFAULT_RELIABILITY_WEIGHTS),
  };
}

/** Facts of all outsource assignments of the given contractors. */
async function factsFor(companyId: string, contractorIds: string[] | undefined, tx: Db) {
  const rows = await tx.taskAssignment.findMany({
    where: { kind: "CONTRACTOR", contractor: { companyId }, ...(contractorIds ? { contractorId: { in: contractorIds } } : {}) },
    select: {
      contractorId: true,
      outsourceStatus: true,
      deadline: true,
      completedAt: true,
      qualityScore: true,
      reworkCount: true,
      agreedUzs: true,
      actualUzs: true,
      createdAt: true,
      task: { select: { id: true, projectId: true, deadline: true } },
    },
  });
  // Complaints = remarks on the task created after the contractor was assigned.
  const remarks = await tx.remark.findMany({
    where: { taskId: { in: rows.map((r) => r.task.id) } },
    select: { taskId: true, createdAt: true },
  });
  const byContractor = new Map<string, { facts: OutsourceFact[]; projects: Set<string> }>();
  for (const r of rows) {
    const e = byContractor.get(r.contractorId!) ?? { facts: [], projects: new Set<string>() };
    e.facts.push({
      status: r.outsourceStatus ?? "ASSIGNED",
      deadline: r.deadline ?? r.task.deadline,
      completedAt: r.completedAt,
      qualityScore: r.qualityScore,
      reworkCount: r.reworkCount,
      agreedUzs: r.agreedUzs === null ? null : Number(r.agreedUzs),
      actualUzs: r.actualUzs === null ? null : Number(r.actualUzs),
      remarks: remarks.filter((m) => m.taskId === r.task.id && m.createdAt >= r.createdAt).length,
    });
    if (r.outsourceStatus !== "CANCELLED") e.projects.add(r.task.projectId);
    byContractor.set(r.contractorId!, e);
  }
  return byContractor;
}

export type ContractorScore = ContractorScoreResult & { projects: number; rawRating: number | null; rawReliability: number | null; lowData: boolean };

/** Scores of contractors; rating and reliability are smoothed toward the company average (M9). */
export async function contractorScores(companyId: string, contractorIds?: string[], tx: Db = db): Promise<Map<string, ContractorScore>> {
  // The company average needs everyone's facts, even when only some contractors are asked for.
  const [weights, facts] = await Promise.all([scoreWeights(companyId, tx), factsFor(companyId, undefined, tx)]);
  const ids = [...facts.keys()];
  const raw = ids.map((id) => scoreContractor(facts.get(id)!.facts, weights.rating, weights.reliability));
  const smooth = smoothScores(raw);
  const out = new Map<string, ContractorScore>();
  ids.forEach((id, i) => {
    if (contractorIds && !contractorIds.includes(id)) return;
    out.set(id, { ...raw[i], ...smooth[i], projects: facts.get(id)!.projects.size });
  });
  return out;
}

/** Save a rating snapshot (history) after a verification / rejection changes the facts. */
export async function snapshotScore(tx: Prisma.TransactionClient, companyId: string, contractorId: string) {
  const s = (await contractorScores(companyId, [contractorId], tx)).get(contractorId);
  if (!s || (s.rating === null && s.reliability === null)) return;
  await tx.contractorScore.create({
    data: {
      contractorId,
      rating: s.rating ?? 0,
      reliability: s.reliability ?? 0,
      components: JSON.parse(JSON.stringify({ rating: s.ratingParts, reliability: s.reliabilityParts, stats: s.stats })),
    },
  });
}

/** Active (assigned / in progress) outsource work per contractor — shown as "busy" when choosing. */
export async function contractorWorkload(companyId: string) {
  const rows = await db.taskAssignment.findMany({
    where: { kind: "CONTRACTOR", contractor: { companyId }, outsourceStatus: { in: ["ASSIGNED", "IN_PROGRESS"] } },
    select: { contractorId: true, deadline: true, task: { select: { project: { select: { name: true } } } } },
  });
  const out = new Map<string, { tasks: number; projects: string[]; until: Date | null }>();
  for (const r of rows) {
    const e = out.get(r.contractorId!) ?? { tasks: 0, projects: [], until: null };
    e.tasks++;
    if (!e.projects.includes(r.task.project.name)) e.projects.push(r.task.project.name);
    if (r.deadline && (!e.until || r.deadline > e.until)) e.until = r.deadline;
    out.set(r.contractorId!, e);
  }
  return out;
}

export async function nextContractorNumber(tx: Db, companyId: string) {
  const last = await tx.contractor.findFirst({ where: { companyId }, orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}
