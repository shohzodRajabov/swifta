"use server";

import { z } from "zod";
import { Prisma, type ServiceTicketStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveMoney } from "@/lib/fx";
import { availableQty, averageCost } from "@/lib/stock";
import { plannedVisits, slaHours } from "@/lib/sla";
import { toDateOnly } from "@/lib/utils";
import { fail, formObject, runAction, zDate, zNumber, zOptId, zOptNumber, zOptText, zText, zVat, type ActionState } from "@/lib/action";
import type { CurrentUser } from "@/lib/auth";
import { averageHourlyCost, nextTicketNumber, underWarranty } from "@/server/service/service";

const ctx = (u: CurrentUser) => ({ companyId: u.companyId, userId: u.id });
const zPriority = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const H = 3600000;

// ---- contracts ---------------------------------------------------------------------

export async function saveContract(id: string | null, _: ActionState, formData: FormData): Promise<ActionState> {
  let target = id ?? "";
  const res = await runAction("service.edit", async (user) => {
    const d = z
      .object({
        clientId: zText,
        projectId: zOptId,
        number: zText,
        startDate: zDate,
        endDate: zDate,
        frequency: z.enum(["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "ON_CALL"]),
        slaResponseHours: zOptNumber,
        slaResolveHours: zOptNumber,
        slaText: zOptText,
        status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED"]).default("ACTIVE"),
        note: zOptText,
        amount: zNumber,
        currency: z.enum(["UZS", "USD"]),
        rate: zOptNumber,
        vatRate: zVat,
      })
      .parse(formObject(formData));
    if (d.endDate < d.startDate) fail("dateOrder");
    if (!(await db.client.findFirst({ where: { id: d.clientId, companyId: user.companyId } }))) fail("invalid");
    if (d.projectId && !(await db.project.findFirst({ where: { id: d.projectId, companyId: user.companyId } }))) fail("invalid");
    const m = await resolveMoney({ amount: d.amount, currency: d.currency, date: d.startDate, manualRate: d.rate });
    const data = {
      clientId: d.clientId,
      projectId: d.projectId,
      number: d.number,
      startDate: toDateOnly(d.startDate),
      endDate: toDateOnly(d.endDate),
      frequency: d.frequency,
      slaResponseHours: d.slaResponseHours ? Math.round(d.slaResponseHours) : null,
      slaResolveHours: d.slaResolveHours ? Math.round(d.slaResolveHours) : null,
      slaText: d.slaText,
      status: d.status,
      note: d.note,
      ...m,
      vatRate: new Prisma.Decimal(d.vatRate),
    };
    await db.$transaction(async (tx) => {
      if (id) {
        const before = await tx.serviceContract.findFirst({ where: { id, companyId: user.companyId } });
        if (!before) fail("invalid");
        const after = await tx.serviceContract.update({ where: { id }, data });
        await audit(tx, ctx(user), "ServiceContract", id, "update", before, after);
      } else {
        const c = await tx.serviceContract.create({ data: { ...data, companyId: user.companyId } });
        await audit(tx, ctx(user), "ServiceContract", c.id, "create", null, c);
        target = c.id;
      }
    });
  });
  if (res?.ok) {
    revalidatePath("/service");
    if (!id) redirect(`/service/contracts/${target}`);
    revalidatePath(`/service/contracts/${id}`);
  }
  return res;
}

/** Create planned maintenance visits (tickets) for the rest of the contract by its frequency. */
export async function planVisits(_: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction("service.edit", async (user) => {
    id = String(formData.get("id"));
    const c = await db.serviceContract.findFirst({ where: { id, companyId: user.companyId }, include: { project: true } });
    if (!c) fail("invalid");
    const today = toDateOnly(new Date());
    const visits = plannedVisits(c.startDate, c.endDate, c.frequency).filter((v) => v >= today);
    const existing = await db.serviceTicket.findMany({ where: { serviceContractId: id, planned: true }, select: { dueAt: true } });
    const have = new Set(existing.map((e) => e.dueAt?.toISOString().slice(0, 10)));
    let created = 0;
    await db.$transaction(async (tx) => {
      let number = await nextTicketNumber(tx, user.companyId);
      for (const v of visits) {
        if (have.has(v.toISOString().slice(0, 10))) continue;
        await tx.serviceTicket.create({
          data: {
            companyId: user.companyId,
            number: number++,
            clientId: c.clientId,
            projectId: c.projectId,
            serviceContractId: c.id,
            siteAddress: c.project?.address ?? null,
            title: `Rejali servis — ${v.toISOString().slice(0, 10)}`,
            problem: c.slaText ? `Shartnoma bo'yicha rejali texnik xizmat. ${c.slaText}` : "Shartnoma bo'yicha rejali texnik xizmat",
            priority: "MEDIUM",
            planned: true,
            reportedAt: new Date(v.getTime() - 7 * 86400000),
            dueAt: new Date(v.getTime() + 18 * H),
            isWarranty: false,
            createdById: user.id,
          },
        });
        created++;
      }
      await audit(tx, ctx(user), "ServiceContract", id, "update", null, { plannedVisits: created });
    });
    return { created: String(created) };
  });
  if (res?.ok) revalidatePath(`/service/contracts/${id}`);
  return res;
}

// ---- tickets -------------------------------------------------------------------------

export async function createTicket(_: ActionState, formData: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction("service.edit", async (user) => {
    const d = z
      .object({
        clientId: zOptId,
        projectId: zOptId,
        serviceContractId: zOptId,
        siteAddress: zOptText,
        title: zText,
        problem: zText,
        priority: zPriority,
        responsibleUserId: zOptId,
        warranty: z.enum(["auto", "yes", "no"]).default("auto"),
      })
      .parse(formObject(formData));
    const [project, contract] = await Promise.all([
      d.projectId ? db.project.findFirst({ where: { id: d.projectId, companyId: user.companyId } }) : null,
      d.serviceContractId ? db.serviceContract.findFirst({ where: { id: d.serviceContractId, companyId: user.companyId } }) : null,
    ]);
    if ((d.projectId && !project) || (d.serviceContractId && !contract)) fail("invalid");
    const clientId = d.clientId ?? contract?.clientId ?? project?.clientId ?? null;
    if (!clientId && !project) fail("ticketClientRequired");
    if (clientId && !(await db.client.findFirst({ where: { id: clientId, companyId: user.companyId } }))) fail("invalid");
    if (d.responsibleUserId && !(await db.user.findFirst({ where: { id: d.responsibleUserId, companyId: user.companyId } }))) fail("invalid");
    const isWarranty = d.warranty === "yes" || (d.warranty === "auto" && underWarranty(project));
    const hours = slaHours(d.priority, contract);
    const now = new Date();
    const t = await db.$transaction(async (tx) => {
      const t = await tx.serviceTicket.create({
        data: {
          companyId: user.companyId,
          number: await nextTicketNumber(tx, user.companyId),
          clientId,
          projectId: project?.id ?? contract?.projectId ?? null,
          serviceContractId: contract?.id ?? null,
          siteAddress: d.siteAddress ?? project?.address ?? null,
          title: d.title,
          problem: d.problem,
          priority: d.priority,
          isWarranty,
          responsibleUserId: d.responsibleUserId,
          status: d.responsibleUserId ? "ASSIGNED" : "NEW",
          respondedAt: d.responsibleUserId ? now : null,
          reportedAt: now,
          dueAt: new Date(now.getTime() + hours.resolve * H),
          createdById: user.id,
        },
      });
      await audit(tx, ctx(user), "ServiceTicket", t.id, "create", null, t);
      return t;
    });
    id = t.id;
  });
  if (res?.ok) redirect(`/service/tickets/${id}`);
  return res;
}

export async function updateTicket(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("service.edit", async (user) => {
    const d = z
      .object({
        diagnosis: zOptText,
        solution: zOptText,
        priority: zPriority,
        responsibleUserId: zOptId,
        laborHours: zOptNumber,
        laborCostUzs: zOptNumber,
        otherCostUzs: zOptNumber,
        chargeUzs: zOptNumber,
        dueAt: z.preprocess((v) => (typeof v === "string" && v ? new Date(v) : null), z.date().nullable()),
      })
      .parse(formObject(formData));
    const before = await db.serviceTicket.findFirst({ where: { id, companyId: user.companyId } });
    if (!before) fail("invalid");
    if (d.responsibleUserId && !(await db.user.findFirst({ where: { id: d.responsibleUserId, companyId: user.companyId } }))) fail("invalid");
    let labor = d.laborCostUzs;
    if (labor === null && d.laborHours) labor = Math.round(d.laborHours * (await averageHourlyCost(user.companyId)));
    const assignedNow = d.responsibleUserId && before.status === "NEW";
    await db.$transaction(async (tx) => {
      const after = await tx.serviceTicket.update({
        where: { id },
        data: {
          diagnosis: d.diagnosis,
          solution: d.solution,
          priority: d.priority,
          responsibleUserId: d.responsibleUserId,
          laborHours: d.laborHours !== null ? new Prisma.Decimal(d.laborHours) : null,
          laborCostUzs: new Prisma.Decimal(labor ?? 0),
          otherCostUzs: new Prisma.Decimal(d.otherCostUzs ?? 0),
          // Warranty work is not billed to the client.
          chargeUzs: new Prisma.Decimal(before.isWarranty ? 0 : (d.chargeUzs ?? 0)),
          ...(d.dueAt ? { dueAt: d.dueAt } : {}),
          ...(assignedNow ? { status: "ASSIGNED" as const, respondedAt: before.respondedAt ?? new Date() } : {}),
        },
      });
      await audit(tx, ctx(user), "ServiceTicket", id, "update", before, after);
    });
  });
  if (res?.ok) revalidatePath(`/service/tickets/${id}`);
  return res;
}

const FLOW: Record<ServiceTicketStatus, ServiceTicketStatus[]> = {
  NEW: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: ["IN_PROGRESS"],
  CANCELLED: ["NEW"],
};

export async function setTicketStatus(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("service.edit", async (user) => {
    const to = z.enum(["NEW", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED", "CANCELLED"]).parse(formData.get("to"));
    const t = await db.serviceTicket.findFirst({ where: { id, companyId: user.companyId } });
    if (!t) fail("invalid");
    if (!FLOW[t.status].includes(to)) fail("badTransition");
    if (to === "RESOLVED" && !t.solution) fail("ticketSolutionRequired");
    const now = new Date();
    await db.$transaction(async (tx) => {
      const after = await tx.serviceTicket.update({
        where: { id },
        data: {
          status: to,
          ...(["ASSIGNED", "IN_PROGRESS"].includes(to) && !t.respondedAt ? { respondedAt: now } : {}),
          ...(to === "RESOLVED" ? { resolvedAt: now } : {}),
          ...(to === "IN_PROGRESS" && t.resolvedAt ? { resolvedAt: null } : {}),
        },
      });
      await audit(tx, ctx(user), "ServiceTicket", id, "update", { status: t.status }, { status: after.status });
    });
  });
  if (res?.ok) revalidatePath(`/service/tickets/${id}`);
  return res;
}

/** Spare part issued from the warehouse for a ticket (warranty parts are charged to the project). */
export async function addPart(ticketId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const res = await runAction("service.edit", async (user) => {
    const d = z.object({ productId: zText, warehouseId: zText, qty: zNumber }).parse(formObject(formData));
    if (d.qty <= 0) fail("required");
    const [t, product, wh] = await Promise.all([
      db.serviceTicket.findFirst({ where: { id: ticketId, companyId: user.companyId } }),
      db.product.findFirst({ where: { id: d.productId, companyId: user.companyId } }),
      db.warehouse.findFirst({ where: { id: d.warehouseId, companyId: user.companyId } }),
    ]);
    if (!t || !product || !wh) fail("invalid");
    if ((await availableQty(user.companyId, product.id, wh.id)) + 1e-9 < d.qty) fail("notEnough");
    const avg = (await averageCost(user.companyId, [product.id])).get(product.id) ?? { uzs: Number(product.purchasePrice ?? 0), usd: 0 };
    await db.$transaction(async (tx) => {
      const m = await tx.stockMovement.create({
        data: {
          companyId: user.companyId,
          type: "ISSUE",
          date: toDateOnly(new Date()),
          productId: product.id,
          name: product.name,
          unit: product.unit,
          qty: new Prisma.Decimal(d.qty),
          warehouseId: wh.id,
          projectId: t.isWarranty ? t.projectId : null,
          serviceTicketId: t.id,
          unitCostUzs: new Prisma.Decimal(avg.uzs.toFixed(2)),
          unitCostUsd: new Prisma.Decimal(avg.usd.toFixed(4)),
          unitCostNetUzs: new Prisma.Decimal(avg.uzs.toFixed(2)),
          unitCostNetUsd: new Prisma.Decimal(avg.usd.toFixed(4)),
          document: `Servis #${t.number}`,
          createdById: user.id,
        },
      });
      await audit(tx, ctx(user), "StockMovement", m.id, "create", null, m);
    });
  });
  if (res?.ok) revalidatePath(`/service/tickets/${ticketId}`);
  return res;
}

export async function removePart(formData: FormData) {
  let ticketId = "";
  await runAction("service.edit", async (user) => {
    const m = await db.stockMovement.findFirst({ where: { id: String(formData.get("id")), companyId: user.companyId, serviceTicketId: { not: null } } });
    if (!m) fail("invalid");
    ticketId = m.serviceTicketId!;
    await db.$transaction(async (tx) => {
      await tx.stockMovement.delete({ where: { id: m.id } });
      await audit(tx, ctx(user), "StockMovement", m.id, "delete", m, null);
    });
  });
  if (ticketId) revalidatePath(`/service/tickets/${ticketId}`);
}
