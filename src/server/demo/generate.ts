/**
 * Demo workspace generator. Creates (or rebuilds) a separate company flagged `isDemo` with realistic HVAC data
 * relative to today's date. Real data is never touched. Runs from the admin UI or `pnpm db:demo`.
 */
import { Prisma, type PrismaClient, type DocumentCategory, type CostCategory, type Currency } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { ensureCompanyDefaults } from "../bootstrap";
import { putObject } from "../files/storage";
import { simplePdf } from "./pdf";
import { wipeCompany } from "./wipe";
import { seedWorkforce } from "./workforce";

export const DEMO_RATE = new Prisma.Decimal("11772.95");
const DAY = 86400000;

export type DemoCtx = {
  db: PrismaClient;
  companyId: string;
  today: Date;
  /** date relative to today (days) */
  d: (days: number) => Date;
  money: (amount: number, currency: Currency, date: Date) => {
    amount: Prisma.Decimal;
    currency: Currency;
    fxRate: Prisma.Decimal;
    fxDate: Date;
    fxSource: string;
    amountUzs: Prisma.Decimal;
    amountUsd: Prisma.Decimal;
  };
  roles: Record<string, string>;
  users: Record<string, string>;
  projects: Record<string, string>;
  products: Record<string, string>;
  clients: Record<string, string>;
  entities: Record<string, string>;
  warehouseId: string;
};

export async function findDemoCompany(db: PrismaClient) {
  return db.company.findFirst({ where: { isDemo: true } });
}

export async function generateDemo(db: PrismaClient): Promise<string> {
  let company = await findDemoCompany(db);
  if (company) await wipeCompany(db, company.id);
  else company = await db.company.create({ data: { name: "Demo HVAC", isDemo: true } });
  await db.company.update({ where: { id: company.id }, data: { name: "Demo HVAC", isDemo: true } });
  await ensureCompanyDefaults(db, company.id);
  // Demo uses its own legal entities.
  await db.project.updateMany({ where: { companyId: company.id }, data: { legalEntityId: null } });
  await db.legalEntity.deleteMany({ where: { companyId: company.id } });

  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const ctx: DemoCtx = {
    db,
    companyId: company.id,
    today,
    d: (days) => new Date(today.getTime() + days * DAY),
    money: (amount, currency, date) => {
      const a = new Prisma.Decimal(amount);
      return {
        amount: a,
        currency,
        fxRate: DEMO_RATE,
        fxDate: date,
        fxSource: "CBU",
        amountUzs: (currency === "UZS" ? a : a.mul(DEMO_RATE)).toDecimalPlaces(2),
        amountUsd: (currency === "USD" ? a : a.div(DEMO_RATE)).toDecimalPlaces(2),
      };
    },
    roles: Object.fromEntries((await db.roleDef.findMany({ where: { companyId: company.id } })).map((r) => [r.key ?? r.name, r.id])),
    users: {},
    projects: {},
    products: {},
    clients: {},
    entities: {},
    warehouseId: (await db.warehouse.findFirstOrThrow({ where: { companyId: company.id } })).id,
  };

  await seedCore(ctx);
  await seedWorkforce(ctx);
  return company.id;
}

async function demoFile(ctx: DemoCtx, title: string, lines: string[], graphics?: string) {
  const body = simplePdf({ title, lines, graphics, landscape: !!graphics });
  const key = `${ctx.companyId}/demo/${randomUUID()}.pdf`;
  await putObject(key, body, "application/pdf");
  return ctx.db.fileObject.create({
    data: { companyId: ctx.companyId, storageKey: key, fileName: `${title.replace(/[^\w]+/g, "_")}.pdf`, mime: "application/pdf", size: body.length },
  });
}

export async function demoDocument(ctx: DemoCtx, projectId: string, category: DocumentCategory, title: string, lines: string[] = []) {
  const file = await demoFile(ctx, title, lines.length ? lines : ["Demo hujjat", "Swifta demo ish maydoni"]);
  return ctx.db.document.create({
    data: {
      companyId: ctx.companyId,
      projectId,
      category,
      title,
      versions: { create: { version: 1, fileId: file.id } },
    },
  });
}

export { demoFile };

async function seedCore(ctx: DemoCtx) {
  const { db, companyId: cid, d, money } = ctx;
  const pass = await bcrypt.hash(randomBytes(12).toString("hex"), 10);

  // ---- people with logins (office) ----
  const staff: [string, string, string, string][] = [
    ["director", "Jasur Aliyev", "DIRECTOR", "998900000100"],
    ["pm1", "Aziz Karimov", "PROJECT_MANAGER", "998900000101"],
    ["pm2", "Dilshod Rahimov", "PROJECT_MANAGER", "998900000102"],
    ["chief", "Nodira Yusupova", "CHIEF_ENGINEER", "998900000103"],
    ["foreman", "Rustam Qodirov", "FOREMAN", "998900000104"],
    ["accountant", "Gulnora Saidova", "ACCOUNTANT", "998900000105"],
    ["storekeeper", "Sherzod Toshmatov", "WAREHOUSE", "998900000106"],
    ["sales", "Malika Ergasheva", "SALES", "998900000107"],
    ["inspector", "Bahrom Nazarov", "INSPECTOR", "998900000108"],
  ];
  for (const [k, name, role, phone] of staff) {
    const u = await db.user.create({
      data: { companyId: cid, name, phone, roleId: ctx.roles[role], passwordHash: pass, position: name.split(" ")[0] },
    });
    ctx.users[k] = u.id;
  }

  // ---- our legal entities ----
  const e1 = await db.legalEntity.create({
    data: { companyId: cid, name: "Demo Klimat MCHJ", tin: "305000111", taxRegime: "GENERAL", isDefault: true, director: "J. Aliyev" },
  });
  const e2 = await db.legalEntity.create({
    data: { companyId: cid, name: "Demo Servis XK", tin: "307000222", taxRegime: "TURNOVER", turnoverTaxRate: 4, director: "J. Aliyev" },
  });
  ctx.entities = { general: e1.id, turnover: e2.id };

  // ---- clients ----
  const clients: [string, string, "COMPANY" | "GOVERNMENT" | "CONTRACTOR", string, string][] = [
    ["brb", "Biznesni rivojlantirish banki (BRB)", "GOVERNMENT", "Sardor Aliyev", "998712000000"],
    ["invest", "Qurilish Invest MCHJ", "CONTRACTOR", "Anvar Raximov", "998901112233"],
    ["mall", "Tashkent City Mall MCHJ", "COMPANY", "Jamshid To'xtayev", "998901234567"],
    ["bomi", "Bomi Kimyo MCHJ", "COMPANY", "Botir Ergashev", "998935551122"],
    ["hotel", "Samarqand Plaza Hotel", "COMPANY", "Feruza Nurmatova", "998662223344"],
    ["hospital", "Navoiy viloyat ko'p tarmoqli shifoxonasi", "GOVERNMENT", "Dilnoza Qosimova", "998792223344"],
    ["textile", "Andijon Tekstil MCHJ", "COMPANY", "Otabek Mirzayev", "998742221100"],
  ];
  for (const [k, name, type, contactPerson, phone] of clients) {
    const c = await db.client.create({ data: { companyId: cid, name, type, contactPerson, phone, address: "O'zbekiston" } });
    ctx.clients[k] = c.id;
  }

  // ---- catalog ----
  const cat = async (key: string) => (await db.productCategory.findFirstOrThrow({ where: { companyId: cid, key } })).id;
  const products: [string, string, string, string | null, string, string, number, Currency, number][] = [
    ["AHU-001", "Havo ishlov berish qurilmasi 10000 m³/h", "Systemair", "Topvex SR11", "AHU", "dona", 18500, "USD", 1],
    ["VRF-OUT-01", "VRF tashqi blok 28 kW", "LG", "ARUM100LTE6", "VRF_OUTDOOR", "dona", 9800, "USD", 1],
    ["VRF-IN-01", "VRF kasseta ichki blok 5.6 kW", "LG", "ARNU18GTRD4", "VRF_INDOOR", "dona", 950, "USD", 4],
    ["DUCT-500x300", "Havo kanali 500×300, 0.7 mm", "Mahalliy", null, "DUCT", "m", 185000, "UZS", 100],
    ["PIPE-CU-12", "Mis quvur 12.7 mm", "Halcor", null, "PIPE", "m", 62000, "UZS", 200],
    ["INS-K-19", "Kauchuk izolyatsiya 19 mm", "K-Flex", "ST", "INSULATION", "m²", 48000, "UZS", 100],
    ["DIF-600", "Shift diffuzori 600×600", "Arktos", "4APN", "DIFFUSER", "dona", 320000, "UZS", 20],
    ["GRL-400", "Panjara 400×200", "Arktos", "AMN", "GRILLE", "dona", 145000, "UZS", 20],
    ["DMP-315", "Havo klapani d315", "Systemair", "SPI 315", "DAMPER", "dona", 410000, "UZS", 10],
    ["CH-350", "Chiller 350 kW", "Carrier", "30RB-352", "CHILLER", "dona", 96000, "USD", 0],
    ["FCU-4T", "Fankoyl 4 trubali 3.5 kW", "Daikin", "FWB04", "FCU", "dona", 780, "USD", 4],
  ];
  for (const [sku, name, manufacturer, model, key, unit, price, currency, minStock] of products) {
    const p = await db.product.create({
      data: {
        companyId: cid,
        sku,
        name,
        manufacturer,
        model,
        categoryId: await cat(key),
        unit,
        purchasePrice: price,
        purchaseCurrency: currency,
        salePrice: Math.round(price * 1.25),
        saleCurrency: currency,
        minStock,
      },
    });
    ctx.products[sku] = p.id;
  }

  // ---- projects ----
  const catalog = await db.statusDef.findMany({ where: { group: { companyId: cid } }, include: { group: true } });
  const flat = catalog.sort((a, b) => a.group.sortOrder - b.group.sortOrder || a.sortOrder - b.sortOrder);
  const status = (code: string) => flat.find((s) => s.code === code)!;

  type Spec = {
    key: string;
    name: string;
    customer: string;
    owner?: string;
    entity: "general" | "turnover";
    statusCode: string;
    objectType: string;
    contract: [number, Currency];
    vat: number;
    start: number;
    end: number;
    actualEnd?: number;
    pm: string;
    priority?: "HIGH" | "MEDIUM";
    warrantyMonths?: number;
    address: string;
  };
  const specs: Spec[] = [
    { key: "brb", name: "BRB ma'muriy binosi — ventilyatsiya va VRF", customer: "invest", owner: "brb", entity: "general", statusCode: "D3", objectType: "Ma'muriy bino", contract: [210000, "USD"], vat: 12, start: -180, end: 60, pm: "pm1", priority: "HIGH", warrantyMonths: 24, address: "Toshkent sh., Shayxontohur t." },
    { key: "mall", name: "Tashkent City Mall — chiller tizimi", customer: "mall", entity: "general", statusCode: "C2", objectType: "Savdo markazi", contract: [3_400_000_000, "UZS"], vat: 12, start: -90, end: 180, pm: "pm2", warrantyMonths: 24, address: "Toshkent sh., Olmazor t." },
    { key: "bomi", name: "Bomi Kimyo — ishlab chiqarish sexi ventilyatsiyasi", customer: "bomi", entity: "turnover", statusCode: "E2", objectType: "Ishlab chiqarish", contract: [1_850_000_000, "UZS"], vat: 0, start: -240, end: -15, pm: "pm1", warrantyMonths: 12, address: "Toshkent viloyati, Chirchiq" },
    { key: "hotel", name: "Samarqand Plaza — VRF tizimi", customer: "hotel", entity: "general", statusCode: "B1", objectType: "Mehmonxona", contract: [0, "UZS"], vat: 12, start: 20, end: 200, pm: "pm2", address: "Samarqand sh." },
    { key: "hospital", name: "Navoiy shifoxonasi — operatsiya bloki ventilyatsiyasi", customer: "invest", owner: "hospital", entity: "general", statusCode: "G1", objectType: "Shifoxona", contract: [980_000_000, "UZS"], vat: 12, start: -420, end: -75, actualEnd: -60, pm: "pm1", warrantyMonths: 12, address: "Navoiy sh." },
    { key: "textile", name: "Andijon Tekstil — sex konditsionerlash", customer: "textile", entity: "general", statusCode: "A3", objectType: "Ishlab chiqarish", contract: [0, "UZS"], vat: 12, start: 45, end: 240, pm: "pm2", address: "Andijon sh." },
  ];

  let n = 1;
  const year = ctx.today.getUTCFullYear();
  for (const s of specs) {
    const start = d(s.start);
    const c = money(s.contract[0], s.contract[1], start);
    const target = status(s.statusCode);
    const p = await db.project.create({
      data: {
        companyId: cid,
        code: `OB-${year}-${String(n++).padStart(3, "0")}`,
        name: s.name,
        clientId: ctx.clients[s.customer],
        ownerId: ctx.clients[s.owner ?? s.customer],
        legalEntityId: ctx.entities[s.entity],
        objectType: s.objectType,
        address: s.address,
        siteContactName: "Obyekt vakili",
        siteContactPhone: "998901000000",
        managerId: ctx.users[s.pm],
        chiefEngineerId: ctx.users.chief,
        foremanId: ctx.users.foreman,
        statusId: target.id,
        priority: s.priority ?? "MEDIUM",
        startDate: start,
        plannedEndDate: d(s.end),
        actualEndDate: s.actualEnd ? d(s.actualEnd) : null,
        warrantyMonths: s.warrantyMonths ?? null,
        warrantyStart: s.statusCode.startsWith("G") ? d(s.actualEnd ?? -60) : null,
        warrantyEnd: s.statusCode.startsWith("G") && s.warrantyMonths ? new Date(d(s.actualEnd ?? -60).getTime() + s.warrantyMonths * 30.4 * DAY) : null,
        contractNumber: s.contract[0] ? `SH-${100 + n}/${year}` : null,
        contractDate: s.contract[0] ? start : null,
        contractAmount: c.amount,
        contractCurrency: c.currency,
        contractFxRate: c.fxRate,
        contractFxDate: c.fxDate,
        contractAmountUzs: c.amountUzs,
        contractAmountUsd: c.amountUsd,
        contractVatRate: s.vat,
      },
    });
    ctx.projects[s.key] = p.id;
    // Status history: walk through the statuses up to the current one.
    const idx = flat.findIndex((x) => x.id === target.id);
    const steps = flat.slice(0, idx + 1).filter((_, i, arr) => i === arr.length - 1 || i % 3 === 0);
    const span = Math.max(1, Math.abs(s.start) + 30);
    for (const [i, st] of steps.entries()) {
      await db.projectStageEvent.create({
        data: {
          projectId: p.id,
          statusId: st.id,
          userId: ctx.users[s.pm],
          enteredAt: new Date(start.getTime() - 30 * DAY + (i / Math.max(1, steps.length)) * span * DAY),
        },
      });
    }
  }

  // ---- BOM, budget, schedule, acts, payments, expenses ----
  const bom = async (projectKey: string, sku: string, qty: number, price: number, currency: Currency, vat: number) => {
    const product = await db.product.findUniqueOrThrow({ where: { id: ctx.products[sku] }, include: { category: true } });
    const m = money(price, currency, d(-150));
    return db.bomItem.create({
      data: {
        projectId: ctx.projects[projectKey],
        productId: product.id,
        kind: product.category.kind,
        name: product.name,
        unit: product.unit,
        plannedQty: qty,
        unitPrice: m.amount,
        currency,
        fxRate: m.fxRate,
        fxDate: m.fxDate,
        unitPriceUzs: m.amountUzs,
        plannedCostUzs: m.amountUzs.mul(qty),
        plannedCostUsd: m.amountUsd.mul(qty).toDecimalPlaces(2),
        vatRate: vat,
      },
    });
  };
  await bom("brb", "AHU-001", 2, 18500, "USD", 12);
  await bom("brb", "VRF-OUT-01", 4, 9800, "USD", 12);
  await bom("brb", "VRF-IN-01", 36, 950, "USD", 12);
  await bom("brb", "DUCT-500x300", 120, 185000, "UZS", 12);
  await bom("brb", "PIPE-CU-12", 640, 62000, "UZS", 12);
  await bom("brb", "INS-K-19", 300, 48000, "UZS", 12);
  await bom("brb", "DIF-600", 40, 320000, "UZS", 12);
  await bom("mall", "CH-350", 2, 96000, "USD", 12);
  await bom("mall", "PIPE-CU-12", 200, 62000, "UZS", 12);
  await bom("mall", "FCU-4T", 60, 780, "USD", 12);
  await bom("bomi", "AHU-001", 1, 18500, "USD", 0);
  await bom("bomi", "DUCT-500x300", 260, 185000, "UZS", 0);
  await bom("bomi", "DIF-600", 48, 320000, "UZS", 0);
  await bom("hospital", "AHU-001", 1, 18500, "USD", 12);
  await bom("hospital", "DUCT-500x300", 180, 185000, "UZS", 12);
  await bom("hospital", "DMP-315", 24, 410000, "UZS", 12);

  const budget = async (projectKey: string, category: CostCategory, amount: number, description: string, vat = 0) =>
    db.budgetLine.create({ data: { projectId: ctx.projects[projectKey], category, description, ...money(amount, "UZS", d(-150)), vatRate: vat } });
  await budget("brb", "LABOR", 180_000_000, "Montaj brigadalari");
  await budget("brb", "TRANSPORT", 25_000_000, "Yuk tashish", 12);
  await budget("brb", "HOTEL", 12_000_000, "Komandirovka");
  await budget("brb", "OUTSOURCING", 40_000_000, "Devor teshish va payvandlash");
  await budget("mall", "LABOR", 250_000_000, "Montaj");
  await budget("mall", "CUSTOMS", 120_000_000, "Chiller bojxonasi");
  await budget("bomi", "LABOR", 210_000_000, "Montaj");
  await budget("hospital", "LABOR", 140_000_000, "Montaj");
  await budget("hospital", "OTHER", 15_000_000, "Laboratoriya sinovlari");

  const schedule = async (projectKey: string, items: [string, number, number][]) => {
    const p = await db.project.findUniqueOrThrow({ where: { id: ctx.projects[projectKey] } });
    const ids: string[] = [];
    for (const [i, [name, pct, due]] of items.entries()) {
      const m = await db.paymentMilestone.create({
        data: {
          projectId: p.id,
          name,
          percent: pct,
          dueDate: d(due),
          sortOrder: i,
          amountUzs: p.contractAmountUzs.mul(pct).div(100),
          amountUsd: p.contractAmountUsd.mul(pct).div(100).toDecimalPlaces(2),
        },
      });
      ids.push(m.id);
    }
    return ids;
  };
  const pay = (projectKey: string, date: number, amount: number, currency: Currency, milestoneId?: string) =>
    db.clientPayment.create({ data: { projectId: ctx.projects[projectKey], milestoneId, date: d(date), ...money(amount, currency, d(date)) } });
  const act = (projectKey: string, number: string, date: number, amount: number, currency: Currency, vat: number, signed = true) =>
    db.act.create({
      data: {
        projectId: ctx.projects[projectKey],
        number,
        date: d(date),
        periodTo: d(date),
        status: signed ? "SIGNED" : "DRAFT",
        signedAt: signed ? d(date) : null,
        ...money(amount, currency, d(date)),
        vatRate: vat,
      },
    });

  const brbMs = await schedule("brb", [
    ["Avans", 30, -175],
    ["Uskuna yetkazilganda", 40, -95],
    ["Montaj tugaganda", 20, 40],
    ["Yakuniy topshirish", 10, 75],
  ]);
  await pay("brb", -172, 63000, "USD", brbMs[0]);
  await pay("brb", -80, 50000, "USD", brbMs[1]);
  await act("brb", "AKT-1", -95, 60000, "USD", 12);
  await act("brb", "AKT-2", -32, 45000, "USD", 12);
  await act("brb", "AKT-3", -2, 30000, "USD", 12, false);
  await db.contractAmendment.create({
    data: {
      projectId: ctx.projects.brb,
      number: "1",
      date: d(-60),
      description: "Qo'shimcha: 2 ta AHU uchun avtomatika",
      ...money(18000, "USD", d(-60)),
      vatRate: 12,
    },
  });

  const mallMs = await schedule("mall", [
    ["Avans", 30, -85],
    ["Uskuna yetkazilganda", 40, 30],
    ["Montaj tugaganda", 20, 150],
    ["Yakuniy topshirish", 10, 190],
  ]);
  await pay("mall", -82, 1_020_000_000, "UZS", mallMs[0]);

  const bomiMs = await schedule("bomi", [
    ["Avans", 30, -230],
    ["Uskuna yetkazilganda", 40, -170],
    ["Montaj tugaganda", 20, -40],
    ["Yakuniy topshirish", 10, -10],
  ]);
  await pay("bomi", -228, 555_000_000, "UZS", bomiMs[0]);
  await pay("bomi", -160, 740_000_000, "UZS", bomiMs[1]);
  await act("bomi", "AKT-1", -60, 1_200_000_000, "UZS", 0);

  const hospMs = await schedule("hospital", [
    ["Avans", 50, -410],
    ["Yakuniy", 50, -55],
  ]);
  await pay("hospital", -405, 490_000_000, "UZS", hospMs[0]);
  await pay("hospital", -50, 490_000_000, "UZS", hospMs[1]);
  await act("hospital", "AKT-1", -70, 980_000_000, "UZS", 12);

  const expense = (projectKey: string, category: CostCategory, description: string, amount: number, currency: Currency, date: number, vat = 0, approval: "APPROVED" | "PENDING" = "APPROVED") =>
    db.expense.create({
      data: {
        projectId: ctx.projects[projectKey],
        category,
        description,
        date: d(date),
        ...money(amount, currency, d(date)),
        vatRate: vat,
        approval,
        createdById: ctx.users.accountant,
        approvedById: approval === "APPROVED" ? ctx.users.director : null,
        approvedAt: approval === "APPROVED" ? d(date) : null,
      },
    });
  await expense("brb", "TRANSPORT", "Uskunani obyektga tashish", 9_500_000, "UZS", -150, 12);
  await expense("brb", "HOTEL", "Montajchilar uchun mehmonxona", 6_000_000, "UZS", -60);
  await expense("brb", "TOOLS", "Payvandlash apparati ijarasi", 4_200_000, "UZS", -45, 12);
  await expense("brb", "TRANSPORT", "Kran ijarasi (2 kun)", 15_000_000, "UZS", -3, 12, "PENDING");
  await expense("mall", "CUSTOMS", "Chiller bojxona rasmiylashtiruvi", 135_000_000, "UZS", -20);
  await expense("bomi", "EQUIPMENT", "AHU — Systemair (to'g'ridan-to'g'ri xarid)", 18900, "USD", -200);
  await expense("bomi", "MATERIAL", "Havo kanallari 310 m", 57_350_000, "UZS", -190);
  await expense("bomi", "MATERIAL", "Diffuzorlar 52 dona", 16_640_000, "UZS", -185);
  await expense("bomi", "SUBCONTRACTOR", "Montaj ishlari (Ventmontaj Servis)", 260_000_000, "UZS", -70);
  await expense("hospital", "EQUIPMENT", "AHU va avtomatika", 21500, "USD", -330, 12);
  await expense("hospital", "MATERIAL", "Havo kanallari va klapanlar", 52_000_000, "UZS", -320, 12);
  await expense("hospital", "LABOR", "Montaj brigadasi", 150_000_000, "UZS", -120);

  // ---- documents ----
  await demoDocument(ctx, ctx.projects.brb, "SIGNED_CONTRACT", "Shartnoma SH-102 (imzolangan)", ["Buyurtmachi: Qurilish Invest MCHJ", "Obyekt egasi: BRB", "Summa: 210 000 USD, QQS bilan"]);
  await demoDocument(ctx, ctx.projects.brb, "COMMERCIAL_OFFER", "Tijorat taklifi v2");
  await demoDocument(ctx, ctx.projects.brb, "SMETA", "Smeta — ventilyatsiya va VRF");
  await demoDocument(ctx, ctx.projects.mall, "SIGNED_CONTRACT", "Shartnoma SH-103 (imzolangan)");
  await demoDocument(ctx, ctx.projects.bomi, "SIGNED_CONTRACT", "Shartnoma SH-104 (imzolangan)");
  await demoDocument(ctx, ctx.projects.hotel, "COMMERCIAL_OFFER", "KP — VRF tizimi, 95 000 USD");
  for (const [cat, title] of [
    ["SIGNED_CONTRACT", "Shartnoma SH-106 (imzolangan)"],
    ["COMPLETION_ACT", "Bajarilgan ishlar dalolatnomasi"],
    ["PAYMENT_PROOF", "To'lov topshiriqnomalari"],
    ["FINAL_DOCS", "Ijro hujjatlari to'plami"],
  ] as [DocumentCategory, string][]) {
    await demoDocument(ctx, ctx.projects.hospital, cat, title);
  }

  // ---- suppliers, prices, purchase orders, stock ----
  const sup = (name: string, contactPerson: string, phone: string, paymentTerms: string, leadTimeDays: number) =>
    db.supplier.create({ data: { companyId: cid, name, contactPerson, phone, paymentTerms, leadTimeDays } });
  const s1 = await sup("Climat Trade MCHJ", "Akmal Usmonov", "998901112233", "50% avans, 50% yetkazilganda", 14);
  const s2 = await sup("Ventmontaj Servis", "Rustam Qodirov", "998934445566", "100% yetkazilgandan keyin 10 kun", 5);
  const s3 = await sup("Euro Duct Group", "Anvar Sobirov", "998977778899", "30% avans", 7);
  for (const [s, sku, price] of [
    [s2, "DUCT-500x300", 185000],
    [s3, "DUCT-500x300", 176000],
    [s1, "DUCT-500x300", 192000],
    [s1, "PIPE-CU-12", 62000],
    [s2, "PIPE-CU-12", 64500],
    [s2, "INS-K-19", 48000],
    [s3, "INS-K-19", 45500],
    [s1, "DIF-600", 320000],
    [s3, "DIF-600", 298000],
  ] as const) {
    const m = money(price, "UZS", d(-30));
    await db.supplierPrice.create({
      data: { supplierId: s.id, productId: ctx.products[sku], price: m.amount, currency: "UZS", priceUzs: m.amountUzs, priceUsd: m.amountUsd, fxRate: m.fxRate, date: d(-30) },
    });
  }

  const order = async (number: string, supplierId: string, projectKey: string, status: "ORDERED" | "RECEIVED" | "PARTIAL", orderDate: number, expectedDate: number, lines: [string, number, number][]) => {
    const prepared = await Promise.all(
      lines.map(async ([sku, qty, price], i) => {
        const p = await db.product.findUniqueOrThrow({ where: { id: ctx.products[sku] } });
        const m = money(qty * price, "UZS", d(orderDate));
        return { productId: p.id, name: p.name, unit: p.unit, qty, unitPrice: price, amount: m.amount, amountUzs: m.amountUzs, amountUsd: m.amountUsd, sortOrder: i };
      }),
    );
    const sum = prepared.reduce((s, l) => s + Number(l.amountUzs), 0);
    const tm = money(sum, "UZS", d(orderDate));
    return db.purchaseOrder.create({
      data: {
        companyId: cid,
        number,
        supplierId,
        projectId: ctx.projects[projectKey],
        warehouseId: ctx.warehouseId,
        status,
        orderDate: d(orderDate),
        expectedDate: d(expectedDate),
        paymentDueDate: d(expectedDate + 10),
        currency: "UZS",
        fxRate: tm.fxRate,
        fxDate: tm.fxDate,
        totalAmount: tm.amount,
        totalUzs: tm.amountUzs,
        totalUsd: tm.amountUsd,
        vatRate: 12,
        createdById: ctx.users.storekeeper,
        lines: { create: prepared },
      },
      include: { lines: true },
    });
  };
  const o1 = await order(`PO-${year}-001`, s3.id, "brb", "RECEIVED", -130, -123, [
    ["DUCT-500x300", 140, 176000],
    ["INS-K-19", 300, 45500],
  ]);
  const o2 = await order(`PO-${year}-002`, s1.id, "brb", "PARTIAL", -128, -10, [["PIPE-CU-12", 640, 62000]]);
  await order(`PO-${year}-003`, s1.id, "brb", "ORDERED", -20, 7, [["DIF-600", 40, 320000]]);

  const move = (data: Prisma.StockMovementUncheckedCreateInput) => db.stockMovement.create({ data });
  const cost = (l: { amountUzs: Prisma.Decimal; amountUsd: Prisma.Decimal; qty: Prisma.Decimal }) => {
    const uzs = l.amountUzs.div(l.qty);
    const usd = l.amountUsd.div(l.qty);
    return {
      unitCostUzs: uzs.toDecimalPlaces(2),
      unitCostUsd: usd.toDecimalPlaces(4),
      unitCostNetUzs: uzs.mul(100).div(112).toDecimalPlaces(2),
      unitCostNetUsd: usd.mul(100).div(112).toDecimalPlaces(4),
      vatRate: 12,
    };
  };
  for (const l of o1.lines) {
    const base = { companyId: cid, productId: l.productId, name: l.name, unit: l.unit, qty: l.qty, ...cost(l) };
    await move({ ...base, type: "RECEIPT", date: d(-123), warehouseId: ctx.warehouseId, poLineId: l.id, projectId: ctx.projects.brb, document: "Nakladnoy 117", createdById: ctx.users.storekeeper });
    await move({ ...base, type: "ISSUE", date: d(-122), warehouseId: ctx.warehouseId, projectId: ctx.projects.brb, createdById: ctx.users.storekeeper });
  }
  const pl = o2.lines[0];
  const pipeBase = { companyId: cid, productId: pl.productId, name: pl.name, unit: pl.unit, ...cost(pl) };
  await move({ ...pipeBase, qty: 400, type: "RECEIPT", date: d(-100), warehouseId: ctx.warehouseId, poLineId: pl.id, projectId: ctx.projects.brb, document: "Nakladnoy 204" });
  await move({ ...pipeBase, qty: 380, type: "ISSUE", date: d(-99), warehouseId: ctx.warehouseId, projectId: ctx.projects.brb });
  // General stock (no project)
  for (const [sku, qty, price] of [
    ["GRL-400", 12, 145000],
    ["DMP-315", 6, 410000],
    ["VRF-IN-01", 2, 950 * 11772.95],
  ] as const) {
    const p = await db.product.findUniqueOrThrow({ where: { id: ctx.products[sku] } });
    const uzs = new Prisma.Decimal(price);
    await move({
      companyId: cid,
      type: "RECEIPT",
      date: d(-40),
      productId: p.id,
      name: p.name,
      unit: p.unit,
      qty,
      warehouseId: ctx.warehouseId,
      unitCostUzs: uzs.toDecimalPlaces(2),
      unitCostUsd: uzs.div(DEMO_RATE).toDecimalPlaces(4),
      unitCostNetUzs: uzs.toDecimalPlaces(2),
      unitCostNetUsd: uzs.div(DEMO_RATE).toDecimalPlaces(4),
      document: "Qoldiq",
    });
  }
  const payS = money(20_000_000, "UZS", d(-120));
  await db.supplierPayment.create({ data: { supplierId: s3.id, orderId: o1.id, date: d(-120), ...payS, approval: "APPROVED" } });
  const payP = money(25_000_000, "UZS", d(-2));
  await db.supplierPayment.create({ data: { supplierId: s1.id, orderId: o2.id, date: d(-2), ...payP, approval: "PENDING" } });

  // ---- overhead (last 6 months) ----
  for (let i = 0; i < 6; i++) {
    const date = new Date(Date.UTC(ctx.today.getUTCFullYear(), ctx.today.getUTCMonth() - i, 5));
    const oh = (category: "OFFICE_RENT" | "OFFICE_SALARY" | "FUEL" | "COMMUNICATION", description: string, amount: number, vat = 0) =>
      db.overheadExpense.create({
        data: { companyId: cid, legalEntityId: ctx.entities.general, category, date, description, ...money(amount, "UZS", date), vatRate: vat, approval: "APPROVED" },
      });
    await oh("OFFICE_RENT", "Ofis ijarasi", 8_000_000, 12);
    await oh("OFFICE_SALARY", "Ofis xodimlari maoshi", 26_000_000);
    await oh("FUEL", "Yoqilg'i", 3_200_000, 12);
    await oh("COMMUNICATION", "Aloqa va internet", 900_000, 12);
  }
  await db.overheadExpense.create({
    data: {
      companyId: cid,
      legalEntityId: ctx.entities.general,
      category: "TOOLS",
      date: d(-1),
      description: "Yangi noutbuklar (2 dona)",
      ...money(14_000_000, "UZS", d(-1)),
      vatRate: 12,
      approval: "PENDING",
    },
  });
}
