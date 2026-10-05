/**
 * Idempotent per-company defaults and data upgrades. Runs on every container start (via prisma/seed.ts)
 * and when a new company (e.g. the demo workspace) is created. Never overwrites admin edits.
 */
import type { BomKind, Prisma, PrismaClient } from "@prisma/client";
import { LEGACY_ROLE_MAP, SYSTEM_ROLES } from "../lib/permissions";
import { DEFAULT_STATUS_GROUPS, LEGACY_STAGE_TO_STATUS } from "../lib/statuses";
import { DEFAULT_KPI_RULES } from "../lib/kpi";

type Db = PrismaClient | Prisma.TransactionClient;

export const PRODUCT_CATEGORIES: [string, BomKind][] = [
  ["AHU", "EQUIPMENT"],
  ["FAN", "EQUIPMENT"],
  ["SMOKE_FAN", "EQUIPMENT"],
  ["SUPPLY_FAN", "EQUIPMENT"],
  ["ROOFTOP", "EQUIPMENT"],
  ["VRF_OUTDOOR", "EQUIPMENT"],
  ["VRF_INDOOR", "EQUIPMENT"],
  ["CHILLER", "EQUIPMENT"],
  ["FCU", "EQUIPMENT"],
  ["SPLIT", "EQUIPMENT"],
  ["CASSETTE", "EQUIPMENT"],
  ["DUCT", "MATERIAL"],
  ["PIPE", "MATERIAL"],
  ["INSULATION", "MATERIAL"],
  ["GRILLE", "MATERIAL"],
  ["DIFFUSER", "MATERIAL"],
  ["VALVE", "MATERIAL"],
  ["DAMPER", "MATERIAL"],
  ["PUMP", "EQUIPMENT"],
  ["AUTOMATION", "EQUIPMENT"],
  ["ELECTRICAL", "MATERIAL"],
  ["FASTENERS", "MATERIAL"],
  ["CONSUMABLES", "MATERIAL"],
];

export const DEFAULT_WORK_TYPES: [string, string][] = [
  ["Ventkanal montaji", "m²"],
  ["Izolyatsiya", "m²"],
  ["Diffuzor va panjara o'rnatish", "dona"],
  ["Freon trassasi", "m"],
  ["Drenaj trassasi", "m"],
  ["Quvur montaji", "m"],
  ["VRF ichki blok o'rnatish", "dona"],
  ["VRF tashqi blok o'rnatish", "dona"],
  ["AHU o'rnatish", "dona"],
  ["Chiller o'rnatish", "dona"],
  ["Ventilyator o'rnatish", "dona"],
  ["Devorni teshish", "dona"],
  ["Elektr ulash", "dona"],
  ["Avtomatika", "dona"],
  ["Puskonaladka", "dona"],
  ["Balansirovka", "dona"],
  ["Testlash", "dona"],
  ["Demontaj", "dona"],
];

export async function ensureCompanyDefaults(db: Db, companyId: string) {
  const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });

  // ---- roles ----
  const existingRoles = await db.roleDef.findMany({ where: { companyId } });
  for (const [i, r] of SYSTEM_ROLES.entries()) {
    if (!existingRoles.some((x) => x.key === r.key)) {
      await db.roleDef.create({
        data: { companyId, key: r.key, name: r.name, permissions: r.permissions, isSystem: true, sortOrder: i },
      });
    }
  }
  // The administrator role always keeps every permission.
  const admin = await db.roleDef.findFirstOrThrow({ where: { companyId, key: "ADMIN" } });
  const allAdmin = SYSTEM_ROLES[0].permissions;
  if (allAdmin.some((p) => !admin.permissions.includes(p))) {
    await db.roleDef.update({ where: { id: admin.id }, data: { permissions: [...new Set([...admin.permissions, ...allAdmin])] } });
  }
  const roles = await db.roleDef.findMany({ where: { companyId } });
  const usersWithoutRole = await db.user.findMany({ where: { companyId, roleId: null } });
  for (const u of usersWithoutRole) {
    const key = u.role ? LEGACY_ROLE_MAP[u.role] : "WORKER";
    const role = roles.find((r) => r.key === key);
    if (role) await db.user.update({ where: { id: u.id }, data: { roleId: role.id } });
  }

  // ---- statuses ----
  for (const [gi, g] of DEFAULT_STATUS_GROUPS.entries()) {
    let group = await db.statusGroup.findUnique({ where: { companyId_code: { companyId, code: g.code } } });
    if (!group) {
      group = await db.statusGroup.create({
        data: { companyId, code: g.code, letter: g.letter, name: g.name, color: g.color, sortOrder: gi },
      });
      for (const [si, st] of g.statuses.entries()) {
        await db.statusDef.create({
          data: { groupId: group.id, code: st.code, name: st.name, sortOrder: si, requiredDocs: st.requiredDocs ?? [] },
        });
      }
    }
  }
  const statuses = await db.statusDef.findMany({ where: { group: { companyId } } });
  const byCode = new Map(statuses.map((s) => [s.code, s.id]));
  const legacyProjects = await db.project.findMany({ where: { companyId, statusId: null }, select: { id: true, stage: true } });
  for (const p of legacyProjects) {
    const statusId = byCode.get(LEGACY_STAGE_TO_STATUS[p.stage]) ?? byCode.get("A1");
    if (statusId) await db.project.update({ where: { id: p.id }, data: { statusId } });
  }
  const legacyEvents = await db.projectStageEvent.findMany({
    where: { project: { companyId }, statusId: null, stage: { not: null } },
    select: { id: true, stage: true },
  });
  for (const e of legacyEvents) {
    const statusId = byCode.get(LEGACY_STAGE_TO_STATUS[e.stage!]);
    if (statusId) await db.projectStageEvent.update({ where: { id: e.id }, data: { statusId } });
  }

  // ---- legal entity (our firm) ----
  let entity = await db.legalEntity.findFirst({ where: { companyId }, orderBy: { createdAt: "asc" } });
  if (!entity) {
    entity = await db.legalEntity.create({ data: { companyId, name: company.name, isDefault: true } });
  }
  await db.project.updateMany({ where: { companyId, legalEntityId: null }, data: { legalEntityId: entity.id } });
  const ownerless = await db.project.findMany({ where: { companyId, ownerId: null }, select: { id: true, clientId: true } });
  for (const p of ownerless) await db.project.update({ where: { id: p.id }, data: { ownerId: p.clientId } });

  // ---- catalog categories, warehouse, work types ----
  for (const [i, [key, kind]] of PRODUCT_CATEGORIES.entries()) {
    await db.productCategory.upsert({
      where: { companyId_name: { companyId, name: key } },
      create: { companyId, key, name: key, kind, sortOrder: i },
      update: {},
    });
  }
  if ((await db.warehouse.count({ where: { companyId } })) === 0) {
    await db.warehouse.create({ data: { companyId, name: "Asosiy ombor" } });
  }
  if ((await db.workType.count({ where: { companyId } })) === 0) {
    await db.workType.createMany({
      data: DEFAULT_WORK_TYPES.map(([name, unit], i) => ({ companyId, name, unit, sortOrder: i })),
    });
  }
  // KPI: version 1 of each formula (the admin edits them as new versions).
  for (const subject of ["EMPLOYEE", "GROUP", "CONTRACTOR"] as const) {
    if ((await db.kpiRule.count({ where: { companyId, subject } })) === 0) {
      const def = DEFAULT_KPI_RULES[subject];
      await db.kpiRule.create({
        data: { companyId, subject, name: def.name, version: 1, effectiveFrom: new Date(Date.UTC(2020, 0, 1)), components: def.components, status: "ACTIVE" },
      });
    }
  }
}
