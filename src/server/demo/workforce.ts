import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { Prisma, type GroupRole, type TaskStatus } from "@prisma/client";
import { computeShares } from "@/server/workforce/contribution";
import { hourlyCost } from "@/lib/payroll";
import { DEMO_RATE, type DemoCtx } from "./generate";

/** Deterministic pseudo-random numbers so the demo looks the same after every rebuild. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type Emp = { key: string; name: string; salary: number; position: string; phone: string; login?: "GROUP_LEADER" | "WORKER" | null };

const EMPLOYEES: Emp[] = [
  { key: "akmal", name: "Akmal Tursunov", salary: 9_000_000, position: "Brigadir (ventilyatsiya)", phone: "998901110001", login: "GROUP_LEADER" },
  { key: "bekzod", name: "Bekzod Mirzayev", salary: 6_500_000, position: "Montajchi", phone: "998901110002", login: "WORKER" },
  { key: "sardor", name: "Sardor Hakimov", salary: 6_000_000, position: "Montajchi", phone: "998901110003" },
  { key: "jahongir", name: "Jahongir Rasulov", salary: 5_500_000, position: "Montajchi", phone: "998901110004" },
  { key: "otabek", name: "Otabek Sobirov", salary: 10_000_000, position: "Brigadir (VRF/freon)", phone: "998901110005", login: "GROUP_LEADER" },
  { key: "ulugbek", name: "Ulug'bek Xolmatov", salary: 7_500_000, position: "Freon montajchisi", phone: "998901110006" },
  { key: "farrux", name: "Farrux Normatov", salary: 7_000_000, position: "Freon montajchisi", phone: "998901110007" },
  { key: "ravshan", name: "Ravshan Ergashev", salary: 8_500_000, position: "Brigadir (izolyatsiya)", phone: "998901110008", login: "GROUP_LEADER" },
  { key: "ilhom", name: "Ilhom Qosimov", salary: 5_500_000, position: "Izolyatsiyachi", phone: "998901110009" },
  { key: "doniyor", name: "Doniyor Usmonov", salary: 5_800_000, position: "Montajchi", phone: "998901110010" },
  { key: "elyor", name: "Elyor Abdullayev", salary: 6_200_000, position: "Elektrik-avtomatchi", phone: "998901110011" },
];

/** Relative productivity of each worker (drives the efficiency index differences in the demo). */
const SKILL: Record<string, number> = {
  akmal: 1.25, bekzod: 1.35, sardor: 1.0, jahongir: 0.65, otabek: 1.2, ulugbek: 1.1, farrux: 0.75, ravshan: 1.1, ilhom: 0.9, doniyor: 0.7, elyor: 1,
};

/** Real crews are slower than the nominal rates above (moving, preparation, waiting). */
const PACE = 0.5;

export async function seedWorkforce(ctx: DemoCtx) {
  const { db, companyId: cid, d } = ctx;
  const rand = rng(42);
  const company = await db.company.findUniqueOrThrow({ where: { id: cid } });
  const pass = await bcrypt.hash(randomBytes(12).toString("hex"), 10);

  // ---- employees (some with logins) ----
  const emp: Record<string, { id: string; salary: number; userId: string | null }> = {};
  for (const e of EMPLOYEES) {
    const user = e.login
      ? await db.user.create({ data: { companyId: cid, name: e.name, phone: e.phone, roleId: ctx.roles[e.login], passwordHash: pass, position: e.position } })
      : null;
    const row = await db.employee.create({
      data: { companyId: cid, fullName: e.name, phone: e.phone, position: e.position, salary: e.salary, hireDate: d(-400 - Math.round(rand() * 300)), userId: user?.id },
    });
    emp[e.key] = { id: row.id, salary: e.salary, userId: user?.id ?? null };
  }
  // The foreman also is an employee (office staff with a login).
  const foreman = await db.employee.create({
    data: { companyId: cid, fullName: "Rustam Qodirov", phone: "998900000104", position: "Prorab", salary: 12_000_000, userId: ctx.users.foreman, hireDate: d(-900) },
  });
  emp.foreman = { id: foreman.id, salary: 12_000_000, userId: ctx.users.foreman };
  ctx.users.leaderA = emp.akmal.userId!;
  ctx.users.leaderB = emp.otabek.userId!;
  ctx.users.leaderC = emp.ravshan.userId!;
  ctx.users.worker = emp.bekzod.userId!;

  // ---- groups with composition history ----
  const groupDefs: { key: string; name: string; spec: string; members: [string, GroupRole, number, number | null][] }[] = [
    { key: "A", name: "1-brigada (ventilyatsiya)", spec: "Ventkanal, diffuzor, AHU", members: [["akmal", "LEADER", -300, null], ["bekzod", "WORKER", -300, null], ["sardor", "WORKER", -300, null], ["jahongir", "WORKER", -200, null], ["doniyor", "WORKER", -300, -41]] },
    { key: "B", name: "2-brigada (VRF / freon)", spec: "Freon trassasi, VRF bloklari", members: [["otabek", "LEADER", -300, null], ["ulugbek", "SENIOR", -300, null], ["farrux", "WORKER", -250, null]] },
    { key: "C", name: "3-brigada (izolyatsiya va montaj)", spec: "Izolyatsiya, quvurlar, diffuzorlar", members: [["ravshan", "LEADER", -300, null], ["ilhom", "WORKER", -300, null], ["doniyor", "WORKER", -40, null], ["elyor", "WORKER", -120, null]] },
  ];
  const groups: Record<string, { id: string; members: [string, GroupRole, number, number | null][] }> = {};
  for (const g of groupDefs) {
    const row = await db.workGroup.create({ data: { companyId: cid, name: g.name, specialization: g.spec } });
    for (const [k, role, from, to] of g.members)
      await db.groupMember.create({ data: { groupId: row.id, employeeId: emp[k].id, role, fromDate: d(from), toDate: to === null ? null : d(to) } });
    groups[g.key] = { id: row.id, members: g.members };
  }
  const membersOn = (gk: string, day: number) =>
    groups[gk].members.filter(([, , from, to]) => from <= day && (to === null || to >= day)).map(([k, role]) => ({ key: k, role }));

  // ---- locations ----
  const wt = Object.fromEntries((await db.workType.findMany({ where: { companyId: cid } })).map((w) => [w.name, w]));
  const loc: Record<string, string> = {};
  const addLoc = async (projectKey: string, key: string, name: string, kind: "FLOOR" | "ZONE" | "ROOM" | "OTHER", order: number) => {
    const l = await db.projectLocation.create({ data: { projectId: ctx.projects[projectKey], name, kind, sortOrder: order } });
    loc[key] = l.id;
  };
  await addLoc("brb", "brb1", "1-qavat", "FLOOR", 0);
  await addLoc("brb", "brb2", "2-qavat", "FLOOR", 1);
  await addLoc("brb", "brb3", "3-qavat", "FLOOR", 2);
  await addLoc("brb", "brbRoof", "Tom (texnik qavat)", "ZONE", 3);
  await addLoc("mall", "mallB", "Yerto'la — chiller xonasi", "ROOM", 0);
  await addLoc("mall", "mall1", "1-qavat savdo zali", "FLOOR", 1);
  await addLoc("bomi", "bomiShop", "Ishlab chiqarish sexi", "ZONE", 0);

  // ---- tasks ----
  type TaskSpec = {
    key: string;
    project: string;
    loc?: string;
    title: string;
    type: string;
    qty: number;
    value: number;
    groups: string[];
    start: number;
    deadline: number;
    done: number; // fraction of planned quantity done by sessions
    status: TaskStatus;
    rate: number; // quantity per person-hour of an average worker
    reported?: number;
  };
  const specs: TaskSpec[] = [
    { key: "brbDuct1", project: "brb", loc: "brb1", title: "Ventkanal montaji — 1-qavat", type: "Ventkanal montaji", qty: 120, value: 21_600_000, groups: ["A"], start: -150, deadline: -110, done: 1, status: "APPROVED", rate: 0.55 },
    { key: "brbDuct2", project: "brb", loc: "brb2", title: "Ventkanal montaji — 2-qavat", type: "Ventkanal montaji", qty: 140, value: 25_200_000, groups: ["A"], start: -40, deadline: 10, done: 0.62, status: "IN_PROGRESS", rate: 0.5, reported: 65 },
    { key: "brbDuct3", project: "brb", loc: "brb3", title: "Ventkanal montaji — 3-qavat", type: "Ventkanal montaji", qty: 130, value: 23_400_000, groups: ["A"], start: 12, deadline: 40, done: 0, status: "ASSIGNED", rate: 0.5 },
    { key: "brbIns1", project: "brb", loc: "brb1", title: "Kanal izolyatsiyasi — 1-qavat", type: "Izolyatsiya", qty: 120, value: 9_600_000, groups: ["C"], start: -105, deadline: -80, done: 1, status: "INSPECTION", rate: 0.9 },
    { key: "brbIns2", project: "brb", loc: "brb2", title: "Kanal izolyatsiyasi — 2-qavat", type: "Izolyatsiya", qty: 140, value: 11_200_000, groups: ["C"], start: -12, deadline: 18, done: 0.3, status: "IN_PROGRESS", rate: 0.9, reported: 30 },
    { key: "brbFreon", project: "brb", loc: "brb2", title: "Freon trassasi — 1–2 qavatlar", type: "Freon trassasi", qty: 320, value: 28_800_000, groups: ["B"], start: -45, deadline: -3, done: 0.76, status: "IN_PROGRESS", rate: 1.4, reported: 80 },
    { key: "brbVrf1", project: "brb", loc: "brb1", title: "VRF ichki bloklari — 1-qavat", type: "VRF ichki blok o'rnatish", qty: 12, value: 7_200_000, groups: ["B"], start: -95, deadline: -70, done: 1, status: "APPROVED", rate: 0.07 },
    { key: "brbVrf2", project: "brb", loc: "brb2", title: "VRF ichki bloklari — 2-qavat", type: "VRF ichki blok o'rnatish", qty: 12, value: 7_200_000, groups: ["B"], start: -30, deadline: -8, done: 1, status: "REWORK", rate: 0.07 },
    { key: "brbVrfOut", project: "brb", loc: "brbRoof", title: "VRF tashqi bloklari — tom", type: "VRF tashqi blok o'rnatish", qty: 4, value: 6_000_000, groups: ["B"], start: 20, deadline: 35, done: 0, status: "NEW", rate: 0.03 },
    { key: "brbAhu", project: "brb", loc: "brbRoof", title: "AHU o'rnatish — tom", type: "AHU o'rnatish", qty: 2, value: 9_000_000, groups: ["A", "C"], start: -5, deadline: 15, done: 0, status: "BLOCKED", rate: 0.02 },
    { key: "brbDif1", project: "brb", loc: "brb1", title: "Diffuzorlar o'rnatish — 1-qavat", type: "Diffuzor va panjara o'rnatish", qty: 14, value: 2_800_000, groups: ["C"], start: -2, deadline: 0, done: 0.5, status: "IN_PROGRESS", rate: 0.2, reported: 50 },
    { key: "brbPnr", project: "brb", title: "Puskonaladka va balansirovka", type: "Puskonaladka", qty: 1, value: 15_000_000, groups: ["B"], start: 45, deadline: 58, done: 0, status: "NEW", rate: 0.01 },
    { key: "mallChiller", project: "mall", loc: "mallB", title: "Chiller o'rnatish", type: "Chiller o'rnatish", qty: 2, value: 24_000_000, groups: ["B"], start: 5, deadline: 30, done: 0, status: "ASSIGNED", rate: 0.01 },
    { key: "mallPipe", project: "mall", loc: "mallB", title: "Sovuq suv quvurlari montaji", type: "Quvur montaji", qty: 200, value: 30_000_000, groups: ["C"], start: -20, deadline: 25, done: 0.35, status: "IN_PROGRESS", rate: 0.6, reported: 35 },
    { key: "mallFcu", project: "mall", loc: "mall1", title: "Fankoyllar o'rnatish", type: "Ventilyator o'rnatish", qty: 60, value: 18_000_000, groups: ["A"], start: 30, deadline: 75, done: 0, status: "NEW", rate: 0.08 },
    { key: "bomiDuct", project: "bomi", loc: "bomiShop", title: "Sex ventkanallari montaji", type: "Ventkanal montaji", qty: 260, value: 46_800_000, groups: ["A"], start: -230, deadline: -150, done: 1, status: "APPROVED", rate: 0.55 },
    { key: "bomiDif", project: "bomi", loc: "bomiShop", title: "Diffuzorlar o'rnatish", type: "Diffuzor va panjara o'rnatish", qty: 48, value: 9_600_000, groups: ["C"], start: -150, deadline: -120, done: 1, status: "APPROVED", rate: 0.22 },
    { key: "bomiTest", project: "bomi", loc: "bomiShop", title: "Tizimni testlash va topshirish", type: "Testlash", qty: 1, value: 6_000_000, groups: ["A"], start: -40, deadline: -20, done: 1, status: "INSPECTION", rate: 0.02 },
  ];

  let number = 1;
  const tasks: Record<string, { id: string; projectId: string; unit: string; spec: TaskSpec }> = {};
  const managerOf = (projectKey: string) => (projectKey === "mall" ? ctx.users.pm2 : ctx.users.pm1);
  for (const s of specs) {
    const w = wt[s.type];
    const created = d(s.start - 7);
    const t = await db.task.create({
      data: {
        companyId: cid,
        projectId: ctx.projects[s.project],
        number: number++,
        title: s.title,
        workTypeId: w?.id,
        locationId: s.loc ? loc[s.loc] : null,
        unit: w?.unit ?? "dona",
        plannedQty: s.qty,
        plannedValueUzs: s.value,
        status: s.status,
        priority: s.key === "brbFreon" || s.key === "brbAhu" ? "HIGH" : "MEDIUM",
        startDate: d(s.start),
        deadline: d(s.deadline),
        actualStart: s.done > 0 || ["IN_PROGRESS", "BLOCKED"].includes(s.status) ? d(s.start) : null,
        actualFinish: ["APPROVED", "INSPECTION", "COMPLETED", "REWORK"].includes(s.status) ? d(Math.min(s.deadline, -1)) : null,
        reportedPercent: s.reported ?? (s.done >= 1 ? 100 : null),
        responsibleId: ctx.users.foreman,
        inspectorId: ctx.users.inspector,
        approverId: s.project === "bomi" ? null : managerOf(s.project),
        createdById: managerOf(s.project),
        createdAt: created,
        assignments: { create: s.groups.map((g) => ({ kind: "GROUP" as const, groupId: groups[g].id })) },
      },
    });
    tasks[s.key] = { id: t.id, projectId: t.projectId, unit: t.unit ?? "dona", spec: s };
    await db.taskEvent.create({ data: { taskId: t.id, type: "CREATED", userId: managerOf(s.project), toStatus: "ASSIGNED", at: created } });
  }

  // ---- work sessions ----
  const leaderUser: Record<string, string> = { A: emp.akmal.userId!, B: emp.otabek.userId!, C: emp.ravshan.userId! };
  const material: Record<string, { bomName: string } | undefined> = {
    "Ventkanal montaji": { bomName: "Havo kanali" },
    Izolyatsiya: { bomName: "Kauchuk izolyatsiya" },
    "Freon trassasi": { bomName: "Mis quvur" },
  };
  const bomByProject = new Map<string, { id: string; name: string; unit: string; unitPriceUzs: Prisma.Decimal; productId: string | null }[]>();
  for (const key of ["brb", "mall", "bomi"]) {
    bomByProject.set(ctx.projects[key], await db.bomItem.findMany({ where: { projectId: ctx.projects[key] }, select: { id: true, name: true, unit: true, unitPriceUzs: true, productId: true } }));
  }
  let disputed = false;
  for (const t of Object.values(tasks)) {
    const s = t.spec;
    if (s.done <= 0) continue;
    const target = s.qty * s.done;
    let doneQty = 0;
    const lastDay = Math.min(-1, s.deadline + (s.done >= 1 ? 0 : 40));
    const dayList: number[] = [];
    for (let day = s.start; day <= lastDay; day++) {
      if (d(day).getUTCDay() === 0) continue; // Sunday off
      dayList.push(day);
    }
    if (dayList.length === 0) continue;
    // Spread the work so that the target is reached on the last working day of the period.
    const sessionsWanted = Math.max(1, Math.min(dayList.length, Math.round(target / Math.max(s.rate * PACE * 8 * 3, 0.5))));
    const step = dayList.length / sessionsWanted;
    for (let i = 0; i < sessionsWanted && doneQty < target - 1e-6; i++) {
      const day = dayList[Math.min(dayList.length - 1, Math.floor(i * step))];
      const gk = s.groups[i % s.groups.length];
      let members = membersOn(gk, day);
      // Occasionally only part of the group works on the task.
      if (members.length > 2 && rand() < 0.55) {
        const drop = 1 + Math.floor(rand() * (members.length - 1));
        members = members.filter((_, idx) => idx !== drop);
      }
      if (members.length > 2 && rand() < 0.3) members = [members[0], members[1 + Math.floor(rand() * (members.length - 1))]];
      if (members.length === 0) continue;
      const hours = rand() < 0.2 ? 6 : 8;
      const skill = (members.reduce((x, m) => x + (SKILL[m.key] ?? 1), 0) / members.length) ** 2.5;
      const remaining = target - doneQty;
      let qty = s.rate * PACE * hours * members.length * skill * (0.95 + rand() * 0.1);
      if (s.qty <= 4) qty = Math.min(remaining, Math.max(1, Math.round(qty)));
      // The last planned session finishes the task unless much more than a normal day's work is left.
      qty = i === sessionsWanted - 1 && (s.done >= 1 || remaining < qty * 1.5) ? remaining : Math.min(remaining, qty);
      qty = t.unit === "dona" ? Math.round(qty) : Math.round(qty * 10) / 10;
      if (qty <= 0) continue;
      doneQty += qty;
      const method = rand() < 0.15 ? ("LEADER" as const) : ("EQUAL" as const);
      const shares = computeShares(
        method,
        qty,
        members.map((m) => ({
          employeeId: emp[m.key].id,
          role: m.role,
          hours,
          percent: method === "LEADER" ? (m.role === "LEADER" ? 100 / members.length + 5 * (members.length - 1) : 100 / members.length - 5) : null,
        })),
      );
      const recent = day > -4;
      const status = recent ? ("SUBMITTED" as const) : ("APPROVED" as const);
      let labor = 0;
      const memberRows = members.map((m) => {
        const e = emp[m.key];
        const rate = hourlyCost(company, { salary: e.salary, normDays: null });
        labor += rate * hours;
        const share = shares.find((x) => x.employeeId === e.id)!;
        let confirmation: "PENDING" | "CONFIRMED" | "DISPUTED" = recent && m.role !== "LEADER" ? "PENDING" : "CONFIRMED";
        if (!disputed && s.key === "brbFreon" && day > -12 && m.key === "farrux") {
          confirmation = "DISPUTED";
          disputed = true;
        }
        return {
          employeeId: e.id,
          role: m.role,
          hours: new Prisma.Decimal(hours),
          sharePercent: new Prisma.Decimal(share.sharePercent),
          contributionQty: new Prisma.Decimal(share.contributionQty),
          hourlyCostUzs: new Prisma.Decimal(rate.toFixed(2)),
          laborCostUzs: new Prisma.Decimal((rate * hours).toFixed(2)),
          confirmation,
          confirmedAt: confirmation === "PENDING" ? null : d(day + 1),
          note: confirmation === "DISPUTED" ? "Men o'sha kuni 4 soat ishladim" : null,
        };
      });
      const leaderKey = members.find((m) => m.role === "LEADER")?.key;
      const session = await db.workSession.create({
        data: {
          companyId: cid,
          projectId: t.projectId,
          taskId: t.id,
          groupId: groups[gk].id,
          leaderId: leaderKey ? emp[leaderKey].id : null,
          date: d(day),
          hours,
          quantity: new Prisma.Decimal(qty.toFixed(3)),
          unit: t.unit,
          method,
          status,
          note: rand() < 0.15 ? "Ish rejadagidek bajarildi" : null,
          problems: s.key === "brbFreon" && day > -10 && rand() < 0.5 ? "Shift balandligi loyihadan farq qiladi, qo'shimcha kronshteyn kerak" : null,
          recordedById: leaderUser[gk],
          approvedById: status === "APPROVED" ? ctx.users.foreman : null,
          approvedAt: status === "APPROVED" ? d(day + 1) : null,
          laborCostUzs: new Prisma.Decimal(labor.toFixed(2)),
          laborCostUsd: new Prisma.Decimal((labor / Number(DEMO_RATE)).toFixed(2)),
          createdAt: d(day),
          members: { create: memberRows },
        },
      });
      for (const m of members)
        await db.attendanceDay.upsert({
          where: { employeeId_date: { employeeId: emp[m.key].id, date: d(day) } },
          create: { companyId: cid, employeeId: emp[m.key].id, date: d(day), type: "OBJECT", projectId: t.projectId, hours, source: "SESSION", recordedById: leaderUser[gk] },
          update: {},
        });
      // Material used, recorded by the group leader.
      const mat = material[s.type];
      const bomItem = mat ? bomByProject.get(t.projectId)?.find((b) => b.name.startsWith(mat.bomName)) : undefined;
      if (bomItem && status === "APPROVED") {
        const used = Math.round(qty * (s.type === "Freon trassasi" ? 2.05 : 1.04) * 10) / 10;
        const unitCost = bomItem.unitPriceUzs;
        await db.stockMovement.create({
          data: {
            companyId: cid,
            type: "CONSUMPTION",
            date: d(day),
            productId: bomItem.productId,
            bomItemId: bomItem.id,
            name: bomItem.name,
            unit: bomItem.unit,
            qty: used,
            projectId: t.projectId,
            taskId: t.id,
            sessionId: session.id,
            unitCostUzs: unitCost,
            unitCostUsd: unitCost.div(DEMO_RATE).toDecimalPlaces(4),
            unitCostNetUzs: unitCost.mul(100).div(112).toDecimalPlaces(2),
            unitCostNetUsd: unitCost.mul(100).div(112).div(DEMO_RATE).toDecimalPlaces(4),
            createdById: leaderUser[gk],
          },
        });
      }
    }
    // Worker activity events
    const leaderKey = membersOn(s.groups[0], s.start)[0]?.key;
    if (leaderKey && emp[leaderKey].userId) {
      await db.taskEvent.create({ data: { taskId: t.id, type: "START", userId: emp[leaderKey].userId, employeeId: emp[leaderKey].id, at: d(s.start) } });
      await db.taskEvent.create({ data: { taskId: t.id, type: "STATUS", userId: emp[leaderKey].userId, fromStatus: "ASSIGNED", toStatus: "IN_PROGRESS", at: d(s.start) } });
      if (s.reported && s.reported < 100)
        await db.taskEvent.create({ data: { taskId: t.id, type: "PROGRESS", userId: emp[leaderKey].userId, employeeId: emp[leaderKey].id, percent: s.reported, at: d(-1) } });
      if (s.done >= 1)
        await db.taskEvent.create({ data: { taskId: t.id, type: "FINISH", userId: emp[leaderKey].userId, employeeId: emp[leaderKey].id, at: d(Math.min(s.deadline, -1)) } });
    }
  }

  // ---- inspections and remarks ----
  let remarkNo = 1;
  const remark = async (taskKey: string | null, projectKey: string, description: string, status: "NEW" | "ASSIGNED" | "IN_PROGRESS" | "FIXED" | "ACCEPTED", deadline: number, extra: { inspectionId?: string; priority?: "HIGH" | "MEDIUM" | "CRITICAL"; locKey?: string; responsible?: string } = {}) =>
    db.remark.create({
      data: {
        companyId: cid,
        projectId: ctx.projects[projectKey],
        number: remarkNo++,
        taskId: taskKey ? tasks[taskKey].id : null,
        locationId: extra.locKey ? loc[extra.locKey] : taskKey && tasks[taskKey].spec.loc ? loc[tasks[taskKey].spec.loc!] : null,
        inspectionId: extra.inspectionId,
        description,
        priority: extra.priority ?? "MEDIUM",
        status,
        responsibleUserId: extra.responsible ?? ctx.users.foreman,
        deadline: d(deadline),
        createdById: ctx.users.inspector,
        createdAt: d(Math.min(deadline - 5, -1)),
        fixedAt: status === "FIXED" || status === "ACCEPTED" ? d(deadline - 1) : null,
        acceptedAt: status === "ACCEPTED" ? d(deadline) : null,
      },
    });
  for (const key of ["brbDuct1", "brbVrf1", "bomiDuct", "bomiDif"]) {
    await db.inspection.create({ data: { taskId: tasks[key].id, attempt: 1, inspectorId: ctx.users.inspector, result: "PASSED", at: d(tasks[key].spec.deadline + 1) } });
    await db.taskEvent.create({ data: { taskId: tasks[key].id, type: "STATUS", userId: ctx.users.inspector, fromStatus: "INSPECTION", toStatus: "APPROVED", at: d(tasks[key].spec.deadline + 2) } });
  }
  const failed = await db.inspection.create({ data: { taskId: tasks.brbVrf2.id, attempt: 1, inspectorId: ctx.users.inspector, result: "REJECTED", note: "3 ta blokda drenaj qiyaligi yetarli emas", at: d(-6) } });
  await db.taskEvent.create({ data: { taskId: tasks.brbVrf2.id, type: "STATUS", userId: ctx.users.inspector, fromStatus: "INSPECTION", toStatus: "REWORK", note: "REJECTED: 3 ta blokda drenaj qiyaligi yetarli emas", at: d(-6) } });
  await remark("brbVrf2", "brb", "2-qavat, 204/206/208 xonalar: VRF ichki bloklari drenaj quvurining qiyaligi 1% dan kam — qayta o'rnatish kerak", "IN_PROGRESS", 2, { inspectionId: failed.id, priority: "HIGH", responsible: emp.otabek.userId! });
  await remark("brbDuct1", "brb", "1-qavat koridor: ventkanal flanetsida germetik yetishmaydi", "ACCEPTED", -100);
  await remark("brbIns1", "brb", "Izolyatsiya choklari 3 joyda yopishmagan (1-qavat, zal)", "FIXED", -1, { responsible: emp.ravshan.userId! });
  await remark("brbAhu", "brb", "AHU uchun rama tayyor emas: quruvchi tomondan beton poydevor quyilmagan", "NEW", 7, { priority: "CRITICAL", responsible: ctx.users.pm1 });
  await remark(null, "brb", "3-qavat: shiftdagi teshiklar loyihaga mos emas, quruvchi bilan kelishish kerak", "ASSIGNED", 5, { locKey: "brb3", responsible: ctx.users.chief });
  await db.taskEvent.create({ data: { taskId: tasks.brbAhu.id, type: "PROBLEM", userId: emp.akmal.userId, employeeId: emp.akmal.id, note: "Poydevor tayyor emas, AHU ni o'rnatib bo'lmaydi", at: d(-3) } });
  await db.taskEvent.create({ data: { taskId: tasks.brbAhu.id, type: "STATUS", userId: ctx.users.foreman, fromStatus: "IN_PROGRESS", toStatus: "BLOCKED", note: "Quruvchi poydevorni tayyorlashini kutyapmiz", at: d(-3) } });
  await db.taskEvent.create({ data: { taskId: tasks.brbFreon.id, type: "COMMENT", userId: emp.otabek.userId, employeeId: emp.otabek.id, note: "Mis quvur yetishmayapti, 80 m qo'shimcha kerak", at: d(-2) } });

  // ---- non-object workdays (workshop, travel, idle) and absences ----
  const extraDays: [string, number, "WORKSHOP" | "TRAVEL" | "OFFICE" | "IDLE_MATERIAL" | "IDLE_CLIENT" | "ABSENT" | "SICK" | "LEAVE", string | null, string][] = [
    ["sardor", -9, "WORKSHOP", null, "Kanal fasonlarini sexda tayyorlash"],
    ["jahongir", -9, "WORKSHOP", null, "Kanal fasonlarini sexda tayyorlash"],
    ["akmal", -16, "TRAVEL", "bomi", "Chirchiqqa yo'l, uskunani olib borish"],
    ["bekzod", -16, "TRAVEL", "bomi", "Chirchiqqa yo'l"],
    ["ulugbek", -5, "IDLE_MATERIAL", "brb", "Mis quvur kelmagan"],
    ["farrux", -5, "IDLE_MATERIAL", "brb", "Mis quvur kelmagan"],
    ["ilhom", -14, "IDLE_CLIENT", "brb", "Buyurtmachi obyektga kiritmadi"],
    ["doniyor", -14, "IDLE_CLIENT", "brb", "Buyurtmachi obyektga kiritmadi"],
    ["elyor", -2, "OFFICE", null, "Avtomatika shkafini yig'ish"],
    ["jahongir", -6, "ABSENT", null, "Sababsiz"],
    ["sardor", -20, "SICK", null, "Kasallik varaqasi"],
    ["ilhom", -27, "LEAVE", null, "Oilaviy sabab"],
  ];
  for (const [k, day, type, projectKey, note] of extraDays) {
    if (d(day).getUTCDay() === 0) continue;
    await db.attendanceDay.upsert({
      where: { employeeId_date: { employeeId: emp[k].id, date: d(day) } },
      create: { companyId: cid, employeeId: emp[k].id, date: d(day), type, projectId: projectKey ? ctx.projects[projectKey] : null, note, source: "MANUAL", recordedById: ctx.users.foreman },
      update: { type, projectId: projectKey ? ctx.projects[projectKey] : null, note, source: "MANUAL" },
    });
  }
  // Workshop / office days for the rest of the working days in the last two months so payroll looks realistic.
  for (let day = -55; day <= -1; day++) {
    if (d(day).getUTCDay() === 0) continue;
    for (const k of Object.keys(emp)) {
      if (k === "foreman") continue;
      const exists = await db.attendanceDay.findUnique({ where: { employeeId_date: { employeeId: emp[k].id, date: d(day) } } });
      if (exists || rand() < 0.35) continue;
      await db.attendanceDay.create({
        data: { companyId: cid, employeeId: emp[k].id, date: d(day), type: rand() < 0.8 ? "WORKSHOP" : "OFFICE", source: "MANUAL", recordedById: ctx.users.foreman },
      });
    }
  }
}
