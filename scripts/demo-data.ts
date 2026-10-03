/**
 * LOCAL ONLY: fills the database with sample HVAC projects for testing the UI.
 * Uses a fixed USD rate so it works offline. Refuses to run when NODE_ENV=production.
 */
import { Prisma, PrismaClient, type ProjectStage, type CostCategory } from "@prisma/client";
import bcrypt from "bcryptjs";

if (process.env.NODE_ENV === "production") throw new Error("demo data is for local development only");

const db = new PrismaClient();
const RATE = new Prisma.Decimal("11772.95");
const D = (s: string) => new Date(s + "T00:00:00Z");

function money(amount: number, currency: "UZS" | "USD", date: Date) {
  const a = new Prisma.Decimal(amount);
  return {
    amount: a,
    currency,
    fxRate: RATE,
    fxDate: date,
    fxSource: "CBU",
    amountUzs: (currency === "UZS" ? a : a.mul(RATE)).toDecimalPlaces(2),
    amountUsd: (currency === "USD" ? a : a.div(RATE)).toDecimalPlaces(2),
  };
}

async function main() {
  const company = await db.company.findFirstOrThrow();
  const cid = company.id;
  const pass = await bcrypt.hash("demo12345", 10);
  const mk = (email: string, name: string, role: "PROJECT_MANAGER" | "ENGINEER" | "ACCOUNTANT") =>
    db.user.upsert({
      where: { companyId_email: { companyId: cid, email } },
      create: { companyId: cid, email, name, role, passwordHash: pass },
      update: {},
    });
  const pm1 = await mk("pm1@demo.uz", "Aziz Karimov", "PROJECT_MANAGER");
  const pm2 = await mk("pm2@demo.uz", "Dilshod Rahimov", "PROJECT_MANAGER");
  const eng = await mk("eng@demo.uz", "Nodira Yusupova", "ENGINEER");
  await mk("buh@demo.uz", "Gulnora Saidova", "ACCOUNTANT");

  const cat = async (key: string) => (await db.productCategory.findFirstOrThrow({ where: { companyId: cid, key } })).id;
  const products = [
    ["AHU-001", "Havo ishlov berish qurilmasi 10000 m³/h", "Systemair", "Topvex SR11", await cat("AHU"), "dona", 18500, "USD"],
    ["VRF-OUT-01", "VRF tashqi blok 28 kW", "LG", "ARUM100LTE6", await cat("VRF_OUTDOOR"), "dona", 9800, "USD"],
    ["VRF-IN-01", "VRF kasseta ichki blok 5.6 kW", "LG", "ARNU18GTRD4", await cat("VRF_INDOOR"), "dona", 950, "USD"],
    ["DUCT-500x300", "Havo kanali 500×300, 0.7 mm", "Mahalliy", null, await cat("DUCT"), "m", 185000, "UZS"],
    ["PIPE-CU-12", "Mis quvur 12.7 mm", "Halcor", null, await cat("PIPE"), "m", 62000, "UZS"],
    ["INS-K-19", "Kauchuk izolyatsiya 19 mm", "K-Flex", "ST", await cat("INSULATION"), "m²", 48000, "UZS"],
    ["DIF-600", "Shift diffuzori 600×600", "Arktos", "4АПН", await cat("DIFFUSER"), "dona", 320000, "UZS"],
    ["CH-350", "Chiller 350 kW", "Carrier", "30RB-352", await cat("CHILLER"), "dona", 96000, "USD"],
  ] as const;
  const prod: Record<string, string> = {};
  for (const [sku, name, manufacturer, model, categoryId, unit, price, currency] of products) {
    const p = await db.product.upsert({
      where: { companyId_sku: { companyId: cid, sku } },
      create: {
        companyId: cid,
        sku,
        name,
        manufacturer,
        model,
        categoryId,
        unit,
        purchasePrice: price,
        purchaseCurrency: currency,
        salePrice: Math.round(price * 1.25),
        saleCurrency: currency,
        minStock: unit === "m" ? 100 : 2,
      },
      update: {},
    });
    prod[sku] = p.id;
  }

  if (await db.project.count({ where: { companyId: cid } })) {
    console.log("Projects already exist, skipping phase 1 demo.");
    await phase2(cid);
    return;
  }

  const clients = await Promise.all(
    [
      ["BRB (Biznesni rivojlantirish banki)", "GOVERNMENT", "Sardor Aliyev", "+998 71 200 00 00", "200123456"],
      ["Tashkent City Mall MCHJ", "COMPANY", "Jamshid To'xtayev", "+998 90 123 45 67", "305987654"],
      ["Bomi Kimyo MCHJ", "COMPANY", "Botir Ergashev", "+998 93 555 11 22", "307111222"],
    ].map(([name, type, contactPerson, phone, tin]) =>
      db.client.create({
        data: { companyId: cid, name, type: type as "COMPANY", contactPerson, phone, tin, address: "Toshkent sh." },
      }),
    ),
  );

  type Spec = {
    name: string;
    client: number;
    pm: string;
    stage: ProjectStage;
    contract: [number, "UZS" | "USD"];
    start: string;
    end: string;
    bom: [string, number, number, "UZS" | "USD", "EQUIPMENT" | "MATERIAL", string][];
    budget: [CostCategory, number][];
    expenses: [CostCategory, string, number, "UZS" | "USD", string][];
    schedule: [string, number, string][];
    payments: [string, number, "UZS" | "USD", number][];
  };

  const specs: Spec[] = [
    {
      name: "BRB ma'muriy binosi — ventilyatsiya va VRF",
      client: 0,
      pm: pm1.id,
      stage: "INSTALLATION",
      contract: [210000, "USD"],
      start: "2026-04-01",
      end: "2026-11-30",
      bom: [
        ["AHU-001", 2, 18500, "USD", "EQUIPMENT", "dona"],
        ["VRF-OUT-01", 4, 9800, "USD", "EQUIPMENT", "dona"],
        ["VRF-IN-01", 36, 950, "USD", "EQUIPMENT", "dona"],
        ["DUCT-500x300", 120, 185000, "UZS", "MATERIAL", "m"],
        ["PIPE-CU-12", 640, 62000, "UZS", "MATERIAL", "m"],
        ["INS-K-19", 300, 48000, "UZS", "MATERIAL", "m²"],
      ],
      budget: [
        ["LABOR", 180_000_000],
        ["TRANSPORT", 25_000_000],
        ["HOTEL", 12_000_000],
      ],
      expenses: [
        ["EQUIPMENT", "AHU 2 dona — Systemair", 37000, "USD", "2026-05-12"],
        ["EQUIPMENT", "VRF tashqi bloklar — LG", 39200, "USD", "2026-05-20"],
        ["EQUIPMENT", "VRF ichki bloklar — LG", 34200, "USD", "2026-06-02"],
        ["LABOR", "Montaj brigadasi — iyul", 62_000_000, "UZS", "2026-07-31"],
        ["LABOR", "Montaj brigadasi — avgust", 65_000_000, "UZS", "2026-08-31"],
        ["LABOR", "Montaj brigadasi — sentyabr", 68_000_000, "UZS", "2026-09-30"],
        ["TRANSPORT", "Yuk tashish", 9_500_000, "UZS", "2026-06-20"],
      ],
      schedule: [
        ["Avans", 30, "2026-04-10"],
        ["Uskuna yetkazilganda", 40, "2026-06-30"],
        ["Montaj tugaganda", 20, "2026-10-31"],
        ["Yakuniy topshirish", 10, "2026-12-15"],
      ],
      payments: [
        ["2026-04-08", 63000, "USD", 0],
        ["2026-07-15", 50000, "USD", 1],
      ],
    },
    {
      name: "Tashkent City Mall — chiller tizimi",
      client: 1,
      pm: pm2.id,
      stage: "PROCUREMENT",
      contract: [3_400_000_000, "UZS"],
      start: "2026-07-01",
      end: "2027-03-31",
      bom: [
        ["CH-350", 2, 96000, "USD", "EQUIPMENT", "dona"],
        ["PIPE-CU-12", 200, 62000, "UZS", "MATERIAL", "m"],
      ],
      budget: [
        ["LABOR", 250_000_000],
        ["CUSTOMS", 120_000_000],
      ],
      expenses: [["CUSTOMS", "Bojxona rasmiylashtiruvi", 135_000_000, "UZS", "2026-09-10"]],
      schedule: [
        ["Avans", 30, "2026-07-15"],
        ["Uskuna yetkazilganda", 40, "2026-10-15"],
        ["Montaj tugaganda", 20, "2027-02-28"],
        ["Yakuniy topshirish", 10, "2027-04-15"],
      ],
      payments: [["2026-07-20", 1_020_000_000, "UZS", 0]],
    },
    {
      name: "Bomi Kimyo — ishlab chiqarish sexi ventilyatsiyasi",
      client: 2,
      pm: pm1.id,
      stage: "TESTING",
      contract: [1_850_000_000, "UZS"],
      start: "2026-02-01",
      end: "2026-09-15",
      bom: [
        ["AHU-001", 1, 18500, "USD", "EQUIPMENT", "dona"],
        ["DUCT-500x300", 260, 185000, "UZS", "MATERIAL", "m"],
        ["DIF-600", 48, 320000, "UZS", "MATERIAL", "dona"],
      ],
      budget: [["LABOR", 210_000_000]],
      expenses: [
        ["EQUIPMENT", "AHU — Systemair", 18900, "USD", "2026-03-10"],
        ["MATERIAL", "Havo kanallari 310 m", 57_350_000, "UZS", "2026-04-02"],
        ["MATERIAL", "Diffuzorlar 52 dona", 16_640_000, "UZS", "2026-04-05"],
        ["LABOR", "Montaj ishlari", 260_000_000, "UZS", "2026-07-20"],
      ],
      schedule: [
        ["Avans", 30, "2026-02-10"],
        ["Uskuna yetkazilganda", 40, "2026-04-15"],
        ["Montaj tugaganda", 20, "2026-08-31"],
        ["Yakuniy topshirish", 10, "2026-09-30"],
      ],
      payments: [
        ["2026-02-12", 555_000_000, "UZS", 0],
        ["2026-04-20", 740_000_000, "UZS", 1],
      ],
    },
    {
      name: "BRB filiali — konditsionerlash (taklif bosqichi)",
      client: 0,
      pm: pm2.id,
      stage: "PROPOSAL",
      contract: [0, "UZS"],
      start: "2026-09-20",
      end: "2027-01-31",
      bom: [],
      budget: [],
      expenses: [],
      schedule: [],
      payments: [],
    },
  ];

  let n = 1;
  for (const s of specs) {
    const start = D(s.start);
    const c = money(s.contract[0], s.contract[1], start);
    const project = await db.project.create({
      data: {
        companyId: cid,
        code: `OB-2026-${String(n++).padStart(3, "0")}`,
        name: s.name,
        clientId: clients[s.client].id,
        managerId: s.pm,
        engineerId: eng.id,
        stage: s.stage,
        priority: n === 2 ? "HIGH" : "MEDIUM",
        startDate: start,
        plannedEndDate: D(s.end),
        contractNumber: s.contract[0] ? `SH-${100 + n}/2026` : null,
        contractDate: s.contract[0] ? start : null,
        address: "Toshkent sh.",
        contractAmount: c.amount,
        contractCurrency: c.currency,
        contractFxRate: c.fxRate,
        contractFxDate: c.fxDate,
        contractAmountUzs: c.amountUzs,
        contractAmountUsd: c.amountUsd,
      },
    });
    const { STAGES } = await import("../src/lib/stages");
    const idx = STAGES.indexOf(s.stage);
    for (let i = 0; i <= idx; i++) {
      await db.projectStageEvent.create({
        data: { projectId: project.id, stage: STAGES[i], enteredAt: new Date(start.getTime() + i * 9 * 86400000) },
      });
    }
    for (const [sku, qty, price, cur, kind, unit] of s.bom) {
      const m = money(price, cur, start);
      const product = await db.product.findUniqueOrThrow({ where: { id: prod[sku] } });
      await db.bomItem.create({
        data: {
          projectId: project.id,
          productId: prod[sku],
          kind,
          name: product.name,
          unit,
          plannedQty: qty,
          unitPrice: m.amount,
          currency: cur,
          fxRate: m.fxRate,
          fxDate: m.fxDate,
          unitPriceUzs: m.amountUzs,
          plannedCostUzs: m.amountUzs.mul(qty),
          plannedCostUsd: m.amountUsd.mul(qty).toDecimalPlaces(2),
        },
      });
    }
    for (const [category, amount] of s.budget) {
      await db.budgetLine.create({ data: { projectId: project.id, category, ...money(amount, "UZS", start) } });
    }
    for (const [category, description, amount, cur, date] of s.expenses) {
      await db.expense.create({
        data: { projectId: project.id, category, description, date: D(date), ...money(amount, cur, D(date)) },
      });
    }
    const milestoneIds: string[] = [];
    for (const [i, [name, pct, due]] of s.schedule.entries()) {
      const m = await db.paymentMilestone.create({
        data: {
          projectId: project.id,
          name,
          percent: pct,
          dueDate: D(due),
          sortOrder: i,
          amountUzs: c.amountUzs.mul(pct).div(100),
          amountUsd: c.amountUsd.mul(pct).div(100).toDecimalPlaces(2),
        },
      });
      milestoneIds.push(m.id);
    }
    for (const [date, amount, cur, mi] of s.payments) {
      await db.clientPayment.create({
        data: { projectId: project.id, milestoneId: milestoneIds[mi], date: D(date), ...money(amount, cur, D(date)) },
      });
    }
  }
  console.log("Demo data created. Demo users password: demo12345");
  await phase2(cid);
}

/** Suppliers, prices, purchase orders, receipts, issues and site usage for the BRB project. */
async function phase2(cid: string) {
  if (await db.supplier.count({ where: { companyId: cid } })) return;
  const wh = await db.warehouse.findFirstOrThrow({ where: { companyId: cid } });
  const sup = async (name: string, contactPerson: string, phone: string, paymentTerms: string, leadTimeDays: number) =>
    db.supplier.create({ data: { companyId: cid, name, contactPerson, phone, paymentTerms, leadTimeDays } });
  const s1 = await sup("Climat Trade MCHJ", "Akmal Usmonov", "+998 90 111 22 33", "50% avans, 50% yetkazilganda", 14);
  const s2 = await sup("Ventmontaj Servis", "Rustam Qodirov", "+998 93 444 55 66", "100% yetkazilgandan keyin 10 kun", 5);
  const s3 = await sup("Euro Duct Group", "Anvar Sobirov", "+998 97 777 88 99", "30% avans", 7);

  const product = (sku: string) => db.product.findFirstOrThrow({ where: { companyId: cid, sku } });
  const duct = await product("DUCT-500x300");
  const pipe = await product("PIPE-CU-12");
  const ins = await product("INS-K-19");
  const date = D("2026-09-01");
  for (const [s, p, price] of [
    [s2, duct, 185000],
    [s3, duct, 176000],
    [s1, duct, 192000],
    [s1, pipe, 62000],
    [s2, pipe, 64500],
    [s2, ins, 48000],
    [s3, ins, 45500],
  ] as const) {
    const m = money(price, "UZS", date);
    await db.supplierPrice.create({
      data: { supplierId: s.id, productId: p.id, price: m.amount, currency: "UZS", priceUzs: m.amountUzs, priceUsd: m.amountUsd, fxRate: m.fxRate, date },
    });
  }

  const brb = await db.project.findFirst({ where: { companyId: cid, code: "OB-2026-001" } });
  if (!brb) return;
  const mkOrder = async (
    number: string,
    supplierId: string,
    status: "ORDERED" | "RECEIVED" | "PARTIAL",
    orderDate: string,
    expectedDate: string,
    lines: { p: { id: string; name: string; unit: string }; qty: number; price: number }[],
  ) => {
    const prepared = lines.map((l, i) => {
      const m = money(l.qty * l.price, "UZS", D(orderDate));
      return { productId: l.p.id, name: l.p.name, unit: l.p.unit, qty: l.qty, unitPrice: l.price, amount: m.amount, amountUzs: m.amountUzs, amountUsd: m.amountUsd, sortOrder: i };
    });
    const total = prepared.reduce((s, l) => s + Number(l.amountUzs), 0);
    const t = money(total, "UZS", D(orderDate));
    return db.purchaseOrder.create({
      data: {
        companyId: cid,
        number,
        supplierId,
        projectId: brb.id,
        warehouseId: wh.id,
        status,
        orderDate: D(orderDate),
        expectedDate: D(expectedDate),
        paymentDueDate: D(expectedDate),
        currency: "UZS",
        fxRate: t.fxRate,
        fxDate: t.fxDate,
        totalAmount: t.amount,
        totalUzs: t.amountUzs,
        totalUsd: t.amountUsd,
        lines: { create: prepared },
      },
      include: { lines: true },
    });
  };
  const o1 = await mkOrder("PO-2026-001", s3.id, "RECEIVED", "2026-06-10", "2026-06-17", [
    { p: duct, qty: 140, price: 176000 },
    { p: ins, qty: 300, price: 45500 },
  ]);
  const o2 = await mkOrder("PO-2026-002", s1.id, "PARTIAL", "2026-06-12", "2026-09-20", [{ p: pipe, qty: 640, price: 62000 }]);

  const move = (data: Record<string, unknown>) => db.stockMovement.create({ data: { companyId: cid, ...data } as never });
  for (const l of o1.lines) {
    const base = { productId: l.productId, name: l.name, unit: l.unit, qty: l.qty, unitCostUzs: l.amountUzs.div(l.qty), unitCostUsd: l.amountUsd.div(l.qty) };
    await move({ ...base, type: "RECEIPT", date: D("2026-06-17"), warehouseId: wh.id, poLineId: l.id, projectId: brb.id, document: "Nakladnoy 117" });
    await move({ ...base, type: "ISSUE", date: D("2026-06-18"), warehouseId: wh.id, projectId: brb.id });
  }
  const pl = o2.lines[0];
  const pipeBase = { productId: pl.productId, name: pl.name, unit: pl.unit, unitCostUzs: pl.amountUzs.div(pl.qty), unitCostUsd: pl.amountUsd.div(pl.qty) };
  await move({ ...pipeBase, qty: 400, type: "RECEIPT", date: D("2026-07-01"), warehouseId: wh.id, poLineId: pl.id, projectId: brb.id, document: "Nakladnoy 204" });
  await move({ ...pipeBase, qty: 380, type: "ISSUE", date: D("2026-07-02"), warehouseId: wh.id, projectId: brb.id });

  // Site usage: duct 138 m vs plan 120 m -> +18 m overuse (the example from the brief).
  await move({ productId: duct.id, name: duct.name, unit: duct.unit, qty: 138, type: "CONSUMPTION", date: D("2026-09-25"), projectId: brb.id, responsible: "Montaj brigadasi" });
  await move({ productId: pipe.id, name: pipe.name, unit: pipe.unit, qty: 350, type: "CONSUMPTION", date: D("2026-09-25"), projectId: brb.id, responsible: "Montaj brigadasi" });
  await move({ productId: ins.id, name: ins.name, unit: ins.unit, qty: 260, type: "CONSUMPTION", date: D("2026-09-25"), projectId: brb.id, responsible: "Montaj brigadasi" });

  const pay = money(20_000_000, "UZS", D("2026-06-20"));
  await db.supplierPayment.create({ data: { supplierId: s3.id, orderId: o1.id, date: D("2026-06-20"), ...pay } });
  console.log("Phase 2 demo data created.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
