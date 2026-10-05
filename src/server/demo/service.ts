import { Prisma } from "@prisma/client";
import type { DemoCtx } from "./generate";
import { DEMO_RATE } from "./generate";
import { plannedVisits } from "@/lib/sla";

const H = 3600000;

export async function seedService(ctx: DemoCtx) {
  const { db, companyId: cid, d, money } = ctx;
  const proj = async (key: string) => db.project.findUniqueOrThrow({ where: { id: ctx.projects[key] } });
  const [arena, hospital, hamkor, resto, bomi] = await Promise.all(["arena", "hospital", "hamkor", "resto", "bomi"].map(proj));

  // Spare parts kept in stock for service.
  const spares: [string, number, number][] = [
    ["VLV-BAL-50", 10, 1_850_000],
    ["SPL-12", 2, 4_000_000],
    ["FAN-SUP-3000", 2, 5_500_000],
    ["PIPE-CU-12", 60, 61_000],
    ["INS-K-13", 80, 14_000],
  ];
  const productOf: Record<string, { id: string; name: string; unit: string; cost: number }> = {};
  for (const [sku, qty, price] of spares) {
    const p = await db.product.findUniqueOrThrow({ where: { id: ctx.products[sku] } });
    const uzs = new Prisma.Decimal(price);
    await db.stockMovement.create({
      data: {
        companyId: cid,
        type: "RECEIPT",
        date: d(-90),
        productId: p.id,
        name: p.name,
        unit: p.unit,
        qty,
        warehouseId: ctx.warehouseId,
        unitCostUzs: uzs,
        unitCostUsd: uzs.div(DEMO_RATE).toDecimalPlaces(4),
        unitCostNetUzs: uzs.mul(100).div(112).toDecimalPlaces(2),
        unitCostNetUsd: uzs.mul(100).div(112).div(DEMO_RATE).toDecimalPlaces(4),
        document: "Servis zaxirasi",
        createdById: ctx.users.storekeeper,
      },
    });
    productOf[sku] = { id: p.id, name: p.name, unit: p.unit, cost: price };
  }

  // ---- contracts ----
  const contract = async (number: string, clientKey: string, projectId: string | null, start: number, end: number, frequency: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL", amount: number, response: number | null, resolve: number | null, slaText: string) =>
    db.serviceContract.create({
      data: { companyId: cid, number, clientId: ctx.clients[clientKey], projectId, startDate: d(start), endDate: d(end), frequency, slaResponseHours: response, slaResolveHours: resolve, slaText, ...money(amount, "UZS", d(start)), vatRate: 12 },
    });
  const cArena = await contract("SX-001/2026", "humo", arena.id, -370, -5 + 365, "MONTHLY", 180_000_000, 4, 24, "Har oy: chiller va nasoslarni ko'rikdan o'tkazish, filtrlarni tozalash, freon bosimini tekshirish, hisobot.");
  const cHosp = await contract("SX-002/2026", "invest", hospital.id, -50, 315, "QUARTERLY", 64_000_000, 2, 12, "Chorakda bir: operatsiya bloki havo almashinuvini o'lchash (protokol), HEPA filtrlarni tekshirish.");
  const cBomi = await contract("SX-003/2026", "bomi", bomi.id, -10, 355, "SEMIANNUAL", 38_000_000, 8, 48, "Yarim yilda bir: ventilyatorlar, kanallar va AHU texnik xizmati.");
  await contract("SX-004/2025", "hamkor", hamkor.id, -400, -35, "QUARTERLY", 24_000_000, 24, 72, "Split tizimlarga chorakda bir xizmat.");

  // ---- tickets ----
  let number = 1;
  type T = {
    title: string;
    problem: string;
    project: typeof arena | null;
    clientKey: string;
    contractId?: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    reported: number; // days ago (negative) with hour offset
    respondH?: number | null; // hours to first response
    resolveH?: number | null; // hours to resolution
    status: "NEW" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
    warranty: boolean;
    diagnosis?: string;
    solution?: string;
    hours?: number;
    other?: number;
    charge?: number;
    parts?: [string, number][];
    responsible?: string;
  };
  const tickets: T[] = [
    { title: "Chiller №2 yuqori bosim xatosi", problem: "Chiller №2 avariya bilan to'xtadi, displeyda HP xatosi.", project: arena, clientKey: "humo", contractId: cArena.id, priority: "CRITICAL", reported: -40, respondH: 1, resolveH: 9, status: "CLOSED", warranty: true, diagnosis: "Kondensator ventilyatori rele kontakti kuygan.", solution: "Rele almashtirildi, kondensator yuvildi, tizim ishga tushirildi.", hours: 6, other: 450_000, parts: [["FAN-SUP-3000", 1]], responsible: "foreman" },
    { title: "Sovuq suv nasosi shovqin qilmoqda", problem: "2-nasosdan kuchli shovqin va tebranish.", project: arena, clientKey: "humo", contractId: cArena.id, priority: "HIGH", reported: -12, respondH: 3, resolveH: 30, status: "RESOLVED", warranty: true, diagnosis: "Balansirovka klapani qisman yopiq, kavitatsiya.", solution: "Klapan almashtirildi, oqim qayta sozlandi.", hours: 5, parts: [["VLV-BAL-50", 2]], responsible: "chief" },
    { title: "Operatsiya xonasida havo almashinuvi past", problem: "3-operatsiya xonasida bosim farqi me'yordan past.", project: hospital, clientKey: "invest", contractId: cHosp.id, priority: "CRITICAL", reported: -3, respondH: 5, resolveH: null, status: "IN_PROGRESS", warranty: true, diagnosis: "HEPA filtr ifloslangan, klapan tiqilgan.", hours: 4, responsible: "chief" },
    { title: "Reanimatsiya bo'limida konditsioner suv oqizmoqda", problem: "Ichki blokdan suv tomchilamoqda.", project: hospital, clientKey: "invest", contractId: cHosp.id, priority: "HIGH", reported: -1, respondH: null, resolveH: null, status: "NEW", warranty: true },
    { title: "Filialda 2 ta split sovutmayapti", problem: "Kassa zalidagi 2 ta konditsioner faqat shamol beradi.", project: hamkor, clientKey: "hamkor", priority: "MEDIUM", reported: -25, respondH: 20, resolveH: 70, status: "CLOSED", warranty: true, diagnosis: "Freon kam (kavsharda mikro-teshik).", solution: "Kavshar qayta qilindi, freon to'ldirildi.", hours: 6, other: 900_000, parts: [["PIPE-CU-12", 4], ["INS-K-13", 4]], responsible: "foreman" },
    { title: "Server xonasi konditsionerini almashtirish", problem: "Kafolatdan tashqari: server xonasiga qo'shimcha split o'rnatish.", project: hamkor, clientKey: "hamkor", priority: "MEDIUM", reported: -18, respondH: 6, resolveH: 52, status: "CLOSED", warranty: false, diagnosis: "Issiqlik yuklamasi oshgan.", solution: "12000 BTU split o'rnatildi.", hours: 8, charge: 7_500_000, parts: [["SPL-12", 1]], responsible: "foreman" },
    { title: "Oshxona so'rish ventilyatori to'xtadi", problem: "Kechqurun ventilyator o'chib qoldi, oshxonada tutun.", project: resto, clientKey: "afsona", priority: "CRITICAL", reported: -6, respondH: 2, resolveH: 40, status: "RESOLVED", warranty: true, diagnosis: "Motor podshipnigi ishdan chiqqan.", solution: "Vaqtinchalik zaxira ventilyator o'rnatildi, motor ta'mirga olindi.", hours: 7, other: 1_200_000, responsible: "foreman" },
    { title: "Sexda harorat 30°C dan yuqori", problem: "Sex 2-zonasida sovutish yetmayapti.", project: bomi, clientKey: "bomi", contractId: cBomi.id, priority: "HIGH", reported: -4, respondH: 14, resolveH: null, status: "ASSIGNED", warranty: false, responsible: "chief" },
    { title: "Ofisga konditsioner o'rnatish (pullik)", problem: "Mijoz ofisiga 1 dona split o'rnatish so'rovi.", project: null, clientKey: "nika", priority: "LOW", reported: -9, respondH: 30, resolveH: 120, status: "CLOSED", warranty: false, solution: "Split o'rnatildi, mijozga topshirildi.", hours: 5, charge: 6_200_000, parts: [["SPL-12", 1]], responsible: "foreman" },
    { title: "Shovqin: ventilyatsiya kanali tebranadi", problem: "Majlislar zalida kanaldan shovqin.", project: arena, clientKey: "humo", contractId: cArena.id, priority: "LOW", reported: -2, respondH: 4, resolveH: null, status: "ASSIGNED", warranty: true, responsible: "foreman" },
  ];
  for (const x of tickets) {
    const reportedAt = new Date(d(x.reported).getTime() + 9 * H);
    const respondedAt = x.respondH ? new Date(reportedAt.getTime() + x.respondH * H) : null;
    const resolvedAt = x.resolveH ? new Date(reportedAt.getTime() + x.resolveH * H) : null;
    const resolveDue = { CRITICAL: 24, HIGH: 48, MEDIUM: 72, LOW: 120 }[x.priority];
    const contractRes = x.contractId === cArena.id ? 24 : x.contractId === cHosp.id ? 12 : x.contractId === cBomi.id ? 48 : null;
    const hourly = 45_000;
    const t = await db.serviceTicket.create({
      data: {
        companyId: cid,
        number: number++,
        clientId: ctx.clients[x.clientKey],
        projectId: x.project?.id ?? null,
        serviceContractId: x.contractId ?? null,
        siteAddress: x.project?.address ?? "Toshkent sh.",
        title: x.title,
        problem: x.problem,
        diagnosis: x.diagnosis,
        solution: x.solution,
        priority: x.priority,
        status: x.status,
        isWarranty: x.warranty,
        responsibleUserId: x.responsible ? ctx.users[x.responsible] : null,
        reportedAt,
        respondedAt,
        resolvedAt,
        dueAt: new Date(reportedAt.getTime() + Math.min(resolveDue, contractRes ?? resolveDue) * H),
        laborHours: x.hours ?? null,
        laborCostUzs: (x.hours ?? 0) * hourly,
        otherCostUzs: x.other ?? 0,
        chargeUzs: x.warranty ? 0 : (x.charge ?? 0),
        createdById: ctx.users.sales,
        createdAt: reportedAt,
      },
    });
    for (const [sku, qty] of x.parts ?? []) {
      const p = productOf[sku];
      const c = new Prisma.Decimal(p.cost);
      await db.stockMovement.create({
        data: {
          companyId: cid,
          type: "ISSUE",
          date: resolvedAt ?? reportedAt,
          productId: p.id,
          name: p.name,
          unit: p.unit,
          qty,
          warehouseId: ctx.warehouseId,
          projectId: x.warranty ? (x.project?.id ?? null) : null,
          serviceTicketId: t.id,
          unitCostUzs: c,
          unitCostUsd: c.div(DEMO_RATE).toDecimalPlaces(4),
          unitCostNetUzs: c,
          unitCostNetUsd: c.div(DEMO_RATE).toDecimalPlaces(4),
          document: `Servis #${t.number}`,
          createdById: ctx.users.storekeeper,
        },
      });
    }
  }

  // ---- planned visits of the monthly / quarterly contracts (past ones done) ----
  for (const c of [cArena, cHosp, cBomi]) {
    for (const v of plannedVisits(c.startDate, c.endDate, c.frequency)) {
      const past = v < ctx.today;
      if (v.getTime() > ctx.today.getTime() + 120 * 86400000) break;
      await db.serviceTicket.create({
        data: {
          companyId: cid,
          number: number++,
          clientId: c.clientId,
          projectId: c.projectId,
          serviceContractId: c.id,
          title: `Rejali servis — ${v.toISOString().slice(0, 10)}`,
          problem: `Shartnoma bo'yicha rejali texnik xizmat. ${c.slaText ?? ""}`,
          priority: "MEDIUM",
          planned: true,
          status: past ? "CLOSED" : "NEW",
          isWarranty: false,
          responsibleUserId: ctx.users.foreman,
          reportedAt: new Date(v.getTime() - 7 * 86400000),
          respondedAt: past ? new Date(v.getTime() - 6 * 86400000) : null,
          resolvedAt: past ? new Date(v.getTime() + 15 * H) : null,
          dueAt: new Date(v.getTime() + 18 * H),
          solution: past ? "Reja bo'yicha xizmat ko'rsatildi, hisobot mijozga topshirildi." : null,
          laborHours: past ? 6 : null,
          laborCostUzs: past ? 6 * 45_000 : 0,
          otherCostUzs: past ? 150_000 : 0,
          createdById: ctx.users.foreman,
        },
      });
    }
  }
}
