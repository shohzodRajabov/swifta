import type { PrismaClient } from "@prisma/client";
import { deleteObject } from "../files/storage";

/**
 * Delete every record of a company (used for the demo workspace). Children first, so no foreign key blocks.
 * Keep this list in sync when adding models.
 */
export async function wipeCompany(db: PrismaClient, companyId: string, opts: { deleteCompany?: boolean } = {}) {
  const files = await db.fileObject.findMany({ where: { companyId }, select: { storageKey: true } });
  const c = { companyId };
  const viaProject = { project: { companyId } };
  await db.$transaction(
    [
      db.drawingZoneTask.deleteMany({ where: { zone: { version: { drawing: c } } } }),
      db.remark.deleteMany({ where: c }),
      db.drawingZone.deleteMany({ where: { version: { drawing: c } } }),
      db.drawingVersion.deleteMany({ where: { drawing: c } }),
      db.drawing.deleteMany({ where: c }),
      db.kpiSnapshot.deleteMany({ where: { period: c } }),
      db.kpiPeriod.deleteMany({ where: c }),
      db.kpiRule.deleteMany({ where: c }),
      db.contractorScore.deleteMany({ where: { contractor: c } }),
      db.contractorPayment.deleteMany({ where: { contractor: c } }),
      db.stockMovement.deleteMany({ where: c }),
      db.workSessionMember.deleteMany({ where: { session: c } }),
      db.workSession.deleteMany({ where: c }),
      db.inspection.deleteMany({ where: { task: c } }),
      db.taskEvent.deleteMany({ where: { task: c } }),
      db.taskAssignment.deleteMany({ where: { task: c } }),
      db.task.updateMany({ where: c, data: { parentId: null } }),
      db.task.deleteMany({ where: c }),
      db.projectLocation.updateMany({ where: viaProject, data: { parentId: null } }),
      db.projectLocation.deleteMany({ where: viaProject }),
      db.attendanceDay.deleteMany({ where: c }),
      db.payrollLine.deleteMany({ where: { month: c } }),
      db.payrollMonth.deleteMany({ where: c }),
      db.smetaImport.deleteMany({ where: c }),
      db.serviceTicket.deleteMany({ where: c }),
      db.serviceContract.deleteMany({ where: c }),
      db.supplierPayment.deleteMany({ where: { supplier: c } }),
      db.supplierPrice.deleteMany({ where: { supplier: c } }),
      db.purchaseOrderLine.deleteMany({ where: { order: c } }),
      db.purchaseOrder.deleteMany({ where: c }),
      db.act.deleteMany({ where: viaProject }),
      db.contractAmendment.deleteMany({ where: viaProject }),
      db.clientPayment.deleteMany({ where: viaProject }),
      db.paymentMilestone.deleteMany({ where: viaProject }),
      db.expense.deleteMany({ where: viaProject }),
      db.budgetLine.deleteMany({ where: viaProject }),
      db.bomItem.deleteMany({ where: viaProject }),
      db.projectStageEvent.deleteMany({ where: viaProject }),
      db.attachment.deleteMany({ where: c }),
      db.documentVersion.deleteMany({ where: { document: c } }),
      db.document.deleteMany({ where: c }),
      db.project.deleteMany({ where: c }),
      db.contractor.deleteMany({ where: c }),
      db.groupMember.deleteMany({ where: { group: c } }),
      db.workGroup.deleteMany({ where: c }),
      db.employee.deleteMany({ where: c }),
      db.workType.deleteMany({ where: c }),
      db.product.deleteMany({ where: c }),
      db.productCategory.deleteMany({ where: c }),
      db.warehouse.deleteMany({ where: c }),
      db.supplier.deleteMany({ where: c }),
      db.client.deleteMany({ where: c }),
      db.overheadExpense.deleteMany({ where: c }),
      db.legalEntity.deleteMany({ where: c }),
      db.fileObject.deleteMany({ where: c }),
      db.auditLog.deleteMany({ where: c }),
      db.statusDef.deleteMany({ where: { group: c } }),
      db.statusGroup.deleteMany({ where: c }),
      db.user.deleteMany({ where: c }),
      db.roleDef.deleteMany({ where: c }),
      ...(opts.deleteCompany ? [db.company.delete({ where: { id: companyId } })] : []),
    ],
  );
  // Stored files are removed after the database commit (best effort).
  for (const f of files) await deleteObject(f.storageKey).catch(() => undefined);
}
