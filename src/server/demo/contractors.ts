import { Prisma, type ContractorKind, type Availability, type OutsourceStatus } from "@prisma/client";
import { scoreContractor, type OutsourceFact } from "@/lib/contractor-score";
import { DEMO_RATE, type DemoCtx } from "./generate";

type C = { key: string; name: string; kind: ContractorKind; phone: string; specs: string[]; regions: string[]; availability: Availability; note?: string; contacts?: [string, string, string][] };

const CONTRACTORS: C[] = [
  { key: "sardor", name: "Sardor Karimov", kind: "INDIVIDUAL", phone: "998931200001", specs: ["Devorni teshish", "Ventkanal montaji"], regions: ["Toshkent", "Toshkent viloyati"], availability: "AVAILABLE", note: "Olmos burg'u bilan beton teshish, 400 mm gacha" },
  { key: "payvand", name: "Payvand Usta brigadasi", kind: "BRIGADE", phone: "998931200002", specs: ["Quvur montaji", "Drenaj trassasi"], regions: ["Toshkent", "Samarqand"], availability: "AVAILABLE", contacts: [["Habib aka", "998931200012", "Brigadir"]] },
  { key: "elektro", name: "Elektro Montaj Servis MCHJ", kind: "COMPANY", phone: "998712000003", specs: ["Elektr ulash", "Avtomatika", "Puskonaladka"], regions: ["Toshkent", "Navoiy", "Samarqand"], availability: "AVAILABLE", contacts: [["Dilnoza Rahmonova", "998901200013", "Menejer"], ["Anvar Sodiqov", "998901200023", "Bosh elektrik"]] },
  { key: "jamshid", name: "Jamshid Aliqulov", kind: "INDIVIDUAL", phone: "998931200004", specs: ["Izolyatsiya"], regions: ["Toshkent"], availability: "AVAILABLE" },
  { key: "kran", name: "Kran Xizmati MCHJ", kind: "COMPANY", phone: "998712000005", specs: ["AHU o'rnatish", "Chiller o'rnatish", "VRF tashqi blok o'rnatish"], regions: ["Butun Respublika"], availability: "UNAVAILABLE", note: "25 t avtokran; noyabrgacha band (boshqa loyiha)" },
  { key: "bahodir", name: "Bahodir To'rayev", kind: "INDIVIDUAL", phone: "998931200006", specs: ["Ventkanal montaji"], regions: ["Toshkent"], availability: "BLACKLISTED", note: "Ikki marta sifatsiz ish, obyektni tashlab ketgan" },
  { key: "izol", name: "Toshkent Izolyatsiya Servis MCHJ", kind: "COMPANY", phone: "998712000007", specs: ["Izolyatsiya"], regions: ["Toshkent", "Toshkent viloyati"], availability: "AVAILABLE", contacts: [["Sevara Ahmedova", "998901200017", "Menejer"]] },
  { key: "avaz", name: "Avazbek Nurmatov", kind: "INDIVIDUAL", phone: "998931200008", specs: ["Drenaj trassasi", "Quvur montaji"], regions: ["Toshkent", "Farg'ona"], availability: "AVAILABLE" },
  { key: "ventprofi", name: "Vent Profi brigadasi", kind: "BRIGADE", phone: "998931200009", specs: ["Ventkanal montaji", "Diffuzor va panjara o'rnatish"], regions: ["Toshkent", "Samarqand", "Buxoro"], availability: "BUSY", contacts: [["Ulug'bek aka", "998931200019", "Brigadir"]], note: "8 kishilik brigada, o'z asbob-uskunasi bilan" },
  { key: "balans", name: "Balans Lab MCHJ", kind: "COMPANY", phone: "998712000010", specs: ["Balansirovka", "Testlash", "Puskonaladka"], regions: ["Butun Respublika"], availability: "AVAILABLE", note: "Akkreditatsiyalangan laboratoriya, o'lchov protokollari beradi" },
];

type W = {
  c: string;
  project: string;
  title: string;
  type: string;
  qty: number;
  unitPrice: number;
  status: OutsourceStatus;
  start: number;
  deadline: number;
  late?: number; // completion days after the deadline (negative = early)
  quality?: number;
  rework?: number;
  actualFactor?: number; // actual / agreed
  paid?: number; // fraction paid
  loc?: string;
  doneFrac?: number;
};

const WORK: W[] = [
  // finished projects — history
  { c: "sardor", project: "hospital", title: "Operatsiya bloki: devorlarni teshish", type: "Devorni teshish", qty: 36, unitPrice: 120_000, status: "VERIFIED", start: -400, deadline: -385, late: 0, quality: 5, paid: 1 },
  { c: "sardor", project: "bomi", title: "Sex devorlarini teshish (kanal o'tishlari)", type: "Devorni teshish", qty: 28, unitPrice: 125_000, status: "VERIFIED", start: -235, deadline: -225, late: -1, quality: 5, paid: 1 },
  { c: "payvand", project: "hospital", title: "Sovuq suv quvurlari payvandlash", type: "Quvur montaji", qty: 140, unitPrice: 95_000, status: "VERIFIED", start: -380, deadline: -350, late: 6, quality: 4, rework: 1, actualFactor: 1.08, paid: 1 },
  { c: "elektro", project: "hospital", title: "AHU elektr ulanishi va avtomatika", type: "Avtomatika", qty: 1, unitPrice: 42_000_000, status: "VERIFIED", start: -320, deadline: -300, late: 2, quality: 5, paid: 1 },
  { c: "jamshid", project: "hospital", title: "Kanal izolyatsiyasi (tom)", type: "Izolyatsiya", qty: 160, unitPrice: 30_000, status: "VERIFIED", start: -360, deadline: -340, late: 9, quality: 3, rework: 1, paid: 1 },
  { c: "jamshid", project: "bomi", title: "Kanal izolyatsiyasi (sex)", type: "Izolyatsiya", qty: 200, unitPrice: 28_000, status: "CANCELLED", start: -200, deadline: -180 },
  { c: "kran", project: "hospital", title: "AHU ni tomga ko'tarish (avtokran)", type: "AHU o'rnatish", qty: 1, unitPrice: 6_500_000, status: "VERIFIED", start: -330, deadline: -330, late: 0, quality: 5, paid: 1 },
  { c: "bahodir", project: "bomi", title: "Kanal montaji — ombor qismi", type: "Ventkanal montaji", qty: 60, unitPrice: 70_000, status: "CANCELLED", start: -210, deadline: -190, rework: 2 },
  { c: "bahodir", project: "hospital", title: "Kanal montaji — koridor", type: "Ventkanal montaji", qty: 40, unitPrice: 70_000, status: "VERIFIED", start: -390, deadline: -375, late: 12, quality: 2, rework: 1, actualFactor: 1.15, paid: 1 },
  // current work
  { c: "sardor", project: "brb", title: "BRB: devorlarni teshish — 1–3 qavat", type: "Devorni teshish", qty: 48, unitPrice: 130_000, status: "VERIFIED", start: -60, deadline: -45, late: 0, quality: 5, paid: 0.6, loc: "brb2" },
  { c: "sardor", project: "brb", title: "BRB: tomdagi o'tishlarni teshish", type: "Devorni teshish", qty: 12, unitPrice: 160_000, status: "IN_PROGRESS", start: -4, deadline: 6, loc: "brbRoof" },
  { c: "payvand", project: "mall", title: "Chiller xonasi: quvurlarni payvandlash", type: "Quvur montaji", qty: 90, unitPrice: 100_000, status: "COMPLETED", start: -25, deadline: -4, late: -1, paid: 0.3, loc: "mallB", doneFrac: 1 },
  { c: "elektro", project: "brb", title: "BRB: VRF bloklarini elektrga ulash", type: "Elektr ulash", qty: 28, unitPrice: 450_000, status: "IN_PROGRESS", start: -15, deadline: 12, paid: 0.3 },
  { c: "elektro", project: "mall", title: "Chiller avtomatikasi va dispetcherlash", type: "Avtomatika", qty: 1, unitPrice: 68_000_000, status: "ASSIGNED", start: 20, deadline: 60 },
  { c: "jamshid", project: "brb", title: "BRB: freon trassasi izolyatsiyasi (2-qavat)", type: "Izolyatsiya", qty: 150, unitPrice: 25_000, status: "REJECTED", start: -20, deadline: -5, rework: 1, loc: "brb2", doneFrac: 1 },
  { c: "izol", project: "pharm", title: "Nika Farm: kanal izolyatsiyasi", type: "Izolyatsiya", qty: 210, unitPrice: 32_000, status: "VERIFIED", start: -60, deadline: -42, late: 0, quality: 5, paid: 1, loc: "pharmStore" },
  { c: "izol", project: "arena", title: "Humo Arena: quvur izolyatsiyasi", type: "Izolyatsiya", qty: 320, unitPrice: 30_000, status: "VERIFIED", start: -460, deadline: -440, late: 1, quality: 4, paid: 1 },
  { c: "izol", project: "nest", title: "Nest One: freon quvurlari izolyatsiyasi", type: "Izolyatsiya", qty: 2000, unitPrice: 9_000, status: "ASSIGNED", start: 10, deadline: 60, loc: "nestLow" },
  { c: "avaz", project: "hamkor", title: "Hamkorbank: drenaj trassasi", type: "Drenaj trassasi", qty: 120, unitPrice: 35_000, status: "VERIFIED", start: -260, deadline: -245, late: 3, quality: 4, paid: 1 },
  { c: "avaz", project: "nest", title: "Nest One: drenaj trassasi 1–4 qavat", type: "Drenaj trassasi", qty: 400, unitPrice: 38_000, status: "IN_PROGRESS", start: -10, deadline: 30, paid: 0.25, loc: "nestLow" },
  { c: "ventprofi", project: "resto", title: "Afsona: zal ventilyatsiyasi kanallari", type: "Ventkanal montaji", qty: 120, unitPrice: 65_000, status: "VERIFIED", start: -70, deadline: -40, late: -2, quality: 5, actualFactor: 0.97, paid: 1 },
  { c: "ventprofi", project: "school", title: "110-maktab: B blok kanallari", type: "Ventkanal montaji", qty: 260, unitPrice: 68_000, status: "IN_PROGRESS", start: -12, deadline: 40, paid: 0.3 },
  { c: "ventprofi", project: "arena", title: "Humo Arena: tribuna kanallari", type: "Ventkanal montaji", qty: 380, unitPrice: 60_000, status: "VERIFIED", start: -480, deadline: -430, late: 4, quality: 4, rework: 1, paid: 1 },
  { c: "balans", project: "pharm", title: "Nika Farm: havo balansirovkasi va protokol", type: "Balansirovka", qty: 1, unitPrice: 9_500_000, status: "COMPLETED", start: -8, deadline: -2, late: -1, doneFrac: 1 },
  { c: "balans", project: "hospital", title: "Shifoxona: toza xona sinovlari", type: "Testlash", qty: 1, unitPrice: 14_000_000, status: "VERIFIED", start: -90, deadline: -80, late: 0, quality: 5, paid: 1 },
  { c: "balans", project: "arena", title: "Humo Arena: chiller tizimi balansirovkasi", type: "Balansirovka", qty: 1, unitPrice: 11_000_000, status: "VERIFIED", start: -395, deadline: -385, late: 0, quality: 5, paid: 1 },
];

export async function seedContractors(ctx: DemoCtx) {
  const { db, companyId: cid, d } = ctx;
  const wt = Object.fromEntries((await db.workType.findMany({ where: { companyId: cid } })).map((w) => [w.name, w]));
  const locs = await db.projectLocation.findMany({ where: { project: { companyId: cid } } });
  const locId = (key?: string) =>
    key === "brb2" ? locs.find((l) => l.name === "2-qavat")?.id : key === "brbRoof" ? locs.find((l) => l.name.startsWith("Tom"))?.id : key === "mallB" ? locs.find((l) => l.name.startsWith("Yerto"))?.id : key === "nestLow" ? locs.find((l) => l.name === "1–4 qavatlar")?.id : key === "pharmStore" ? locs.find((l) => l.name === "Saqlash zali")?.id : null;
  let number = ((await db.task.findFirst({ where: { companyId: cid }, orderBy: { number: "desc" } }))?.number ?? 0) + 1;

  const ids: Record<string, string> = {};
  for (const [i, c] of CONTRACTORS.entries()) {
    const row = await db.contractor.create({
      data: {
        companyId: cid,
        number: i + 1,
        kind: c.kind,
        name: c.name,
        phone: c.phone,
        specializations: c.specs,
        regions: c.regions,
        availability: c.availability,
        note: c.note,
        tin: c.kind === "COMPANY" ? `30${8000000 + i * 1111}` : null,
        bankDetails: c.kind === "COMPANY" ? "H/r 2020 8000 1234 5678 9001, Kapitalbank" : "Karta: 8600 **** **** 4521",
        contacts: { create: (c.contacts ?? []).map(([name, phone, role]) => ({ name, phone, role })) },
        createdAt: d(-420),
      },
    });
    ids[c.key] = row.id;
  }

  const facts = new Map<string, OutsourceFact[]>();
  for (const w of WORK) {
    const type = wt[w.type];
    const agreed = w.qty * w.unitPrice;
    const finished = w.status === "VERIFIED" || w.status === "COMPLETED" || w.status === "REJECTED";
    const completedAt = finished ? d(w.deadline + (w.late ?? 0)) : null;
    const actual = finished ? agreed * (w.actualFactor ?? 1) : null;
    const taskStatus =
      w.status === "VERIFIED" ? (w.project === "brb" ? "APPROVED" : "APPROVED") : w.status === "COMPLETED" ? "COMPLETED" : w.status === "CANCELLED" ? "CANCELLED" : w.status === "REJECTED" ? "REWORK" : w.status === "IN_PROGRESS" ? "IN_PROGRESS" : "ASSIGNED";
    const manager = ["mall", "nest", "pharm"].includes(w.project) ? ctx.users.pm2 : ctx.users.pm1;
    const task = await db.task.create({
      data: {
        companyId: cid,
        projectId: ctx.projects[w.project],
        number: number++,
        title: w.title,
        workTypeId: type?.id,
        locationId: locId(w.loc) ?? null,
        unit: type?.unit ?? "dona",
        plannedQty: w.qty,
        plannedValueUzs: Math.round(agreed * 1.25),
        status: taskStatus,
        startDate: d(w.start),
        deadline: d(w.deadline),
        actualStart: w.status !== "ASSIGNED" ? d(w.start) : null,
        actualFinish: completedAt,
        reportedPercent: finished ? 100 : w.status === "IN_PROGRESS" ? 40 : null,
        responsibleId: ctx.users.foreman,
        inspectorId: ctx.users.inspector,
        createdById: manager,
        createdAt: d(w.start - 5),
      },
    });
    const usd = (uzs: number) => new Prisma.Decimal((uzs / Number(DEMO_RATE)).toFixed(2));
    const a = await db.taskAssignment.create({
      data: {
        taskId: task.id,
        kind: "CONTRACTOR",
        contractorId: ids[w.c],
        contactName: CONTRACTORS.find((c) => c.key === w.c)!.contacts?.[0]?.[0] ?? CONTRACTORS.find((c) => c.key === w.c)!.name,
        contactPhone: CONTRACTORS.find((c) => c.key === w.c)!.contacts?.[0]?.[1] ?? CONTRACTORS.find((c) => c.key === w.c)!.phone,
        plannedQty: w.qty,
        plannedCostUzs: Math.round(agreed * 0.95),
        agreedAmount: agreed,
        currency: "UZS",
        fxRate: DEMO_RATE,
        fxDate: d(w.start),
        fxSource: "CBU",
        agreedUzs: agreed,
        agreedUsd: usd(agreed),
        actualUzs: actual,
        actualUsd: actual ? usd(actual) : null,
        outsourceStatus: w.status,
        startDate: d(w.start),
        deadline: d(w.deadline),
        completedQty: finished ? w.qty * (w.doneFrac ?? 1) : w.status === "IN_PROGRESS" ? Math.round(w.qty * 0.4) : null,
        completedAt,
        verifiedById: w.status === "VERIFIED" ? manager : null,
        verifiedAt: w.status === "VERIFIED" ? d(w.deadline + (w.late ?? 0) + 1) : null,
        qualityScore: w.quality ?? null,
        reworkCount: w.rework ?? 0,
        createdAt: d(w.start - 5),
      },
    });
    await db.taskEvent.create({ data: { taskId: task.id, type: "CREATED", userId: manager, toStatus: "ASSIGNED", at: d(w.start - 5) } });
    await db.taskEvent.create({ data: { taskId: task.id, type: "COMMENT", userId: manager, note: `Contractor: ${CONTRACTORS.find((c) => c.key === w.c)!.name}`, at: d(w.start - 5) } });
    if (w.status === "REJECTED")
      await db.taskEvent.create({
        data: { taskId: task.id, type: "PROBLEM", userId: ctx.users.inspector, note: `${CONTRACTORS.find((c) => c.key === w.c)!.name} — ish qaytarildi: choklar yopishtirilmagan, 12 joyda ochiq`, at: d(-3) },
      });
    if (w.paid && actual) {
      const amount = Math.round((actual * w.paid) / 100_000) * 100_000;
      const parts = w.paid >= 1 ? [0.5, 0.5] : [1];
      for (const [i, part] of parts.entries()) {
        const v = Math.round(amount * part);
        await db.contractorPayment.create({
          data: {
            contractorId: ids[w.c],
            assignmentId: a.id,
            projectId: ctx.projects[w.project],
            date: d(w.start + 3 + i * Math.max(1, w.deadline - w.start + 2)),
            method: CONTRACTORS.find((c) => c.key === w.c)!.kind === "COMPANY" ? "BANK" : "CASH",
            amount: v,
            currency: "UZS",
            fxRate: DEMO_RATE,
            fxDate: d(w.start),
            amountUzs: v,
            amountUsd: usd(v),
            approval: "APPROVED",
            approvedById: ctx.users.director,
            approvedAt: d(w.start + 3),
            createdById: ctx.users.accountant,
          },
        });
      }
    } else if (w.status === "IN_PROGRESS" && w.paid) {
      const v = Math.round((agreed * w.paid) / 100_000) * 100_000;
      await db.contractorPayment.create({
        data: { contractorId: ids[w.c], assignmentId: a.id, projectId: ctx.projects[w.project], date: d(w.start + 1), method: "BANK", note: "Avans", amount: v, currency: "UZS", fxRate: DEMO_RATE, fxDate: d(w.start), amountUzs: v, amountUsd: usd(v), approval: "APPROVED", createdById: ctx.users.accountant },
      });
    }
    const list = facts.get(w.c) ?? [];
    list.push({ status: w.status, deadline: d(w.deadline), completedAt, qualityScore: w.quality ?? null, reworkCount: w.rework ?? 0, agreedUzs: agreed, actualUzs: actual, remarks: 0 });
    facts.set(w.c, list);
    // Score history: a snapshot after each finished piece of work.
    if (["VERIFIED", "REJECTED", "CANCELLED"].includes(w.status)) {
      const s = scoreContractor(list);
      if (s.rating !== null || s.reliability !== null)
        await db.contractorScore.create({
          data: { contractorId: ids[w.c], at: d(w.deadline + (w.late ?? 0) + 1), rating: s.rating ?? 0, reliability: s.reliability ?? 0, components: JSON.parse(JSON.stringify({ rating: s.ratingParts, reliability: s.reliabilityParts, stats: s.stats })) },
        });
    }
  }
  // A pending payment waiting for the director's approval.
  const pay = 18_000_000;
  await db.contractorPayment.create({
    data: { contractorId: ids.payvand, projectId: ctx.projects.mall, date: d(-1), method: "BANK", note: "Yakuniy to'lov", amount: pay, currency: "UZS", fxRate: DEMO_RATE, fxDate: d(-1), amountUzs: pay, amountUsd: new Prisma.Decimal((pay / Number(DEMO_RATE)).toFixed(2)), approval: "PENDING", createdById: ctx.users.accountant },
  });
}
