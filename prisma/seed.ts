/**
 * Runs on every container start after migrations. Idempotent:
 *  - creates the company and the first administrator if the database is empty
 *    (SEED_COMPANY_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PHONE, SEED_ADMIN_PASSWORD — generated and printed if missing);
 *  - ensures defaults / data upgrades for every company (roles, statuses, categories, ...).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { ensureCompanyDefaults } from "../src/server/bootstrap";
import { normalizePhone } from "../src/lib/phone";
import { DEMO_VERSION, generateDemo } from "../src/server/demo/generate";

const db = new PrismaClient();

async function main() {
  let company = await db.company.findFirst({ where: { isDemo: false }, orderBy: { createdAt: "asc" } });
  if (!company) {
    company = await db.company.create({ data: { name: process.env.SEED_COMPANY_NAME ?? "Swifta" } });
    console.log(`Company created: ${company.name}`);
  }

  for (const c of await db.company.findMany()) {
    await ensureCompanyDefaults(db, c.id);
  }

  const adminRole = await db.roleDef.findFirstOrThrow({ where: { companyId: company.id, key: "ADMIN" } });
  const admins = await db.user.count({ where: { companyId: company.id, roleId: adminRole.id } });
  if (admins === 0) {
    const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@swifta.uz").toLowerCase();
    const phone = process.env.SEED_ADMIN_PHONE ? normalizePhone(process.env.SEED_ADMIN_PHONE) : null;
    const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(9).toString("base64url");
    await db.user.create({
      data: {
        companyId: company.id,
        email,
        phone,
        name: "Administrator",
        roleId: adminRole.id,
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
    console.log(`Admin created: ${email}`);
    if (!process.env.SEED_ADMIN_PASSWORD) console.log(`Generated password: ${password}`);
  }

  // Optional: build the separate demo workspace once (SEED_DEMO=1).
  const demo = await db.company.findFirst({ where: { isDemo: true } });
  if (process.env.SEED_DEMO === "1" && (!demo || demo.demoVersion < DEMO_VERSION)) {
    const id = await generateDemo(db);
    console.log(`Demo workspace ${demo ? "rebuilt" : "created"} (v${DEMO_VERSION}): ${id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
