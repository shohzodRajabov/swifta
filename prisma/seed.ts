/**
 * Idempotent bootstrap: company, first admin, product categories.
 *   SEED_COMPANY_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (generated & printed if missing)
 */
import { PrismaClient, type BomKind } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const db = new PrismaClient();

const CATEGORIES: [string, BomKind][] = [
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

async function main() {
  let company = await db.company.findFirst();
  if (!company) {
    company = await db.company.create({ data: { name: process.env.SEED_COMPANY_NAME ?? "Swifta" } });
    console.log(`Company created: ${company.name}`);
  }

  for (const [i, [key, kind]] of CATEGORIES.entries()) {
    await db.productCategory.upsert({
      where: { companyId_name: { companyId: company.id, name: key } },
      create: { companyId: company.id, key, name: key, kind, sortOrder: i },
      update: { key, kind, sortOrder: i },
    });
  }

  if ((await db.warehouse.count({ where: { companyId: company.id } })) === 0) {
    await db.warehouse.create({ data: { companyId: company.id, name: "Asosiy ombor" } });
    console.log("Warehouse created: Asosiy ombor");
  }

  const admins = await db.user.count({ where: { companyId: company.id, role: "ADMIN" } });
  if (admins === 0) {
    const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@swifta.uz").toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(9).toString("base64url");
    await db.user.create({
      data: {
        companyId: company.id,
        email,
        name: "Administrator",
        role: "ADMIN",
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
    console.log(`Admin created: ${email}`);
    if (!process.env.SEED_ADMIN_PASSWORD) console.log(`Generated password: ${password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
