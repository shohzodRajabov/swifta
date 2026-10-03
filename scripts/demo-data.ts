/**
 * Builds (or rebuilds) the separate "Demo" workspace with realistic data. Real data is never touched.
 * Run: pnpm db:demo
 */
import { PrismaClient } from "@prisma/client";
import { generateDemo } from "../src/server/demo/generate";

const db = new PrismaClient();
generateDemo(db)
  .then((id) => console.log(`Demo workspace ready: ${id}`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
