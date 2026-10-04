"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/auth";
import { resolveMoney } from "@/lib/fx";
import { fail, runAction, type ActionState } from "@/lib/action";
import { accessibleProject } from "@/server/projects/access";
import { nextTaskNumber } from "@/server/workforce/tasks";
import type { SmetaRow } from "@/server/import/smeta";

const KINDS = ["TASK", "EQUIPMENT", "MATERIAL", "SKIP"] as const;

/** Read the edited review table back from the form. */
function rowsFrom(formData: FormData, original: SmetaRow[]): SmetaRow[] {
  return original.map((r, i) => {
    const kind = String(formData.get(`kind_${i}`) ?? r.kind);
    const qty = Number(String(formData.get(`qty_${i}`) ?? r.qty).replace(",", "."));
    const price = Number(String(formData.get(`price_${i}`) ?? r.unitPrice).replace(/\s/g, "").replace(",", "."));
    return {
      ...r,
      name: String(formData.get(`name_${i}`) ?? r.name).trim() || r.name,
      unit: String(formData.get(`unit_${i}`) ?? r.unit).trim() || r.unit,
      kind: (KINDS as readonly string[]).includes(kind) ? (kind as SmetaRow["kind"]) : r.kind,
      qty: Number.isFinite(qty) && qty > 0 ? qty : r.qty,
      unitPrice: Number.isFinite(price) && price >= 0 ? price : r.unitPrice,
      total: (Number.isFinite(qty) && qty > 0 ? qty : r.qty) * (Number.isFinite(price) && price >= 0 ? price : r.unitPrice),
    };
  });
}

async function loadDraft(companyId: string, id: string) {
  const imp = await db.smetaImport.findFirst({ where: { id, companyId } });
  if (!imp || imp.status !== "DRAFT") fail("invalid");
  return imp;
}

export async function saveImport(id: string, _: ActionState, formData: FormData): Promise<ActionState> {
  let projectId = "";
  const res = await runAction(["import.manage", "import.approve"], async (user) => {
    const imp = await loadDraft(user.companyId, id);
    await accessibleProject(user, imp.projectId);
    projectId = imp.projectId;
    const currency = z.enum(["UZS", "USD"]).parse(formData.get("currency") ?? imp.currency);
    const vatRate = Number(formData.get("vatRate") ?? imp.vatRate);
    const rows = rowsFrom(formData, imp.rows as SmetaRow[]);
    await db.smetaImport.update({ where: { id }, data: { rows, currency, vatRate: new Prisma.Decimal(vatRate) } });
    if (formData.get("intent") === "approve") await approveImportRows(user, id);
  });
  if (res?.ok) revalidatePath(`/projects/${projectId}/import`);
  return res;
}

async function approveImportRows(user: CurrentUser, id: string) {
  if (!can(user, "import.approve")) fail("forbidden");
  const imp = await loadDraft(user.companyId, id);
  const rows = (imp.rows as SmetaRow[]).filter((r) => r.kind !== "SKIP");
  if (rows.length === 0) fail("importNoRows");
  const price = await resolveMoney({ amount: 1, currency: imp.currency, date: new Date() });
  const sections = [...new Set(rows.map((r) => r.section).filter(Boolean))] as string[];
  const vat = Number(imp.vatRate);
  await db.$transaction(
    async (tx) => {
      // Sections become locations (floors / zones) so tasks are grouped as in the estimate.
      const existing = await tx.projectLocation.findMany({ where: { projectId: imp.projectId } });
      const locationOf = new Map<string, string>();
      let order = existing.length;
      for (const s of sections) {
        const found = existing.find((l) => l.name.toLowerCase() === s.toLowerCase());
        const loc = found ?? (await tx.projectLocation.create({ data: { projectId: imp.projectId, name: s, kind: /этаж|qavat|floor/i.test(s) ? "FLOOR" : "ZONE", sortOrder: order++ } }));
        locationOf.set(s, loc.id);
      }
      let bomOrder = await tx.bomItem.count({ where: { projectId: imp.projectId } });
      let number = await nextTaskNumber(tx, user.companyId);
      for (const r of rows) {
        const unitUzs = imp.currency === "USD" ? new Prisma.Decimal(r.unitPrice).mul(price.fxRate) : new Prisma.Decimal(r.unitPrice);
        const unitUsd = imp.currency === "USD" ? new Prisma.Decimal(r.unitPrice) : new Prisma.Decimal(r.unitPrice).div(price.fxRate);
        const qty = new Prisma.Decimal(r.qty);
        if (r.kind === "TASK") {
          const net = unitUzs.mul(qty).mul(100).div(100 + vat);
          const t = await tx.task.create({
            data: {
              companyId: user.companyId,
              projectId: imp.projectId,
              number: number++,
              title: r.name.slice(0, 300),
              unit: r.unit,
              plannedQty: qty,
              plannedValueUzs: net.toDecimalPlaces(2),
              locationId: r.section ? locationOf.get(r.section) : null,
              importId: imp.id,
              createdById: user.id,
            },
          });
          await tx.taskEvent.create({ data: { taskId: t.id, type: "CREATED", userId: user.id, toStatus: "NEW", note: `Smeta #${r.row}` } });
        } else {
          await tx.bomItem.create({
            data: {
              projectId: imp.projectId,
              kind: r.kind as "EQUIPMENT" | "MATERIAL",
              name: r.name.slice(0, 300),
              unit: r.unit,
              plannedQty: qty,
              sortOrder: bomOrder++,
              unitPrice: new Prisma.Decimal(r.unitPrice),
              currency: imp.currency,
              fxRate: price.fxRate,
              fxDate: price.fxDate,
              fxSource: price.fxSource,
              unitPriceUzs: unitUzs.toDecimalPlaces(2),
              plannedCostUzs: unitUzs.mul(qty).toDecimalPlaces(2),
              plannedCostUsd: unitUsd.mul(qty).toDecimalPlaces(2),
              vatRate: imp.vatRate,
            },
          });
        }
      }
      await tx.smetaImport.update({ where: { id }, data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date() } });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "SmetaImport", id, "update", { status: "DRAFT" }, {
        status: "APPROVED",
        tasks: rows.filter((r) => r.kind === "TASK").length,
        bom: rows.filter((r) => r.kind !== "TASK").length,
      });
    },
    { timeout: 60000 },
  );
}

export async function rejectImport(formData: FormData) {
  let projectId = "";
  await runAction(["import.manage", "import.approve"], async (user) => {
    const imp = await loadDraft(user.companyId, String(formData.get("id")));
    projectId = imp.projectId;
    await db.$transaction(async (tx) => {
      await tx.smetaImport.update({ where: { id: imp.id }, data: { status: "REJECTED" } });
      await audit(tx, { companyId: user.companyId, userId: user.id }, "SmetaImport", imp.id, "update", { status: "DRAFT" }, { status: "REJECTED" });
    });
  });
  if (projectId) revalidatePath(`/projects/${projectId}/import`);
}
