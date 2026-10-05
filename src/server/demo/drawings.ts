import type { Prisma } from "@prisma/client";
import type { DemoCtx } from "./generate";
import { demoFile } from "./generate";
import { floorPlanGraphics } from "./pdf";

// Landscape A4 user space of the demo floor plan (PDF origin is bottom-left; zones are top-left relative).
const PW = 842;
const PH = 595;
const rect = (x: number, y: number, w: number, h: number) => ({ kind: "RECT" as const, x: x / PW, y: (PH - (y + h)) / PH, w: w / PW, h: h / PH });
const line = (...pts: [number, number][]) => ({ kind: "LINE" as const, points: pts.map(([x, y]) => [x / PW, (PH - y) / PH] as [number, number]) });
const point = (x: number, y: number) => ({ kind: "POINT" as const, x: x / PW, y: (PH - y) / PH });
const poly = (...pts: [number, number][]) => ({ kind: "POLYGON" as const, points: pts.map(([x, y]) => [x / PW, (PH - y) / PH] as [number, number]) });

type Z = { name: string; g: Prisma.InputJsonValue & { kind: "POINT" | "LINE" | "RECT" | "POLYGON" }; tasks: string[]; review?: boolean };

export async function seedDrawings(ctx: DemoCtx) {
  const { db, companyId: cid, d } = ctx;
  const taskId = async (projectKey: string, title: string) =>
    (await db.task.findFirst({ where: { projectId: ctx.projects[projectKey], title }, select: { id: true } }))?.id;

  const make = async (projectKey: string, title: string, discipline: string, versions: { note: string | null; lines: string[]; zones: Z[]; day: number }[]) => {
    const drawing = await db.drawing.create({ data: { companyId: cid, projectId: ctx.projects[projectKey], title, discipline, createdAt: d(versions[0].day) } });
    let last: { id: string } | null = null;
    for (const [i, v] of versions.entries()) {
      const file = await demoFile(ctx, `${title} v${i + 1}`, v.lines, floorPlanGraphics());
      const isLast = i === versions.length - 1;
      const review = isLast && v.zones.some((z) => z.review);
      last = await db.drawingVersion.create({
        data: { drawingId: drawing.id, version: i + 1, fileId: file.id, pageCount: 1, note: v.note, needsReview: review, createdById: ctx.users.chief, createdAt: d(v.day) },
      });
      for (const z of v.zones) {
        const ids = (await Promise.all(z.tasks.map((t) => taskId(projectKey, t)))).filter(Boolean) as string[];
        await db.drawingZone.create({
          data: {
            versionId: last.id,
            page: 1,
            name: z.name,
            kind: z.g.kind,
            geometry: z.g,
            needsReview: isLast && !!z.review,
            createdById: ctx.users.chief,
            tasks: { create: ids.map((id) => ({ taskId: id })) },
          },
        });
      }
    }
    return last!;
  };

  // BRB — 1st floor: v1, then v2 (diffusers moved) with carried-over zones partly confirmed.
  const floor1Zones = (review: boolean): Z[] => [
    { name: "101-xona", g: rect(60, 330, 180, 170), tasks: ["Ventkanal montaji — 1-qavat", "Diffuzorlar o'rnatish — 1-qavat"], review },
    { name: "102-xona", g: rect(240, 330, 180, 170), tasks: ["Ventkanal montaji — 1-qavat", "Kanal izolyatsiyasi — 1-qavat"] },
    { name: "103-xona", g: rect(420, 330, 180, 170), tasks: ["Ventkanal montaji — 1-qavat", "Kanal izolyatsiyasi — 1-qavat", "Diffuzorlar o'rnatish — 1-qavat"], review },
    { name: "Koridor — magistral kanal", g: line([80, 300], [760, 300]), tasks: ["Ventkanal montaji — 1-qavat", "Kanal izolyatsiyasi — 1-qavat"] },
    { name: "Zal (ochiq ofis)", g: rect(60, 90, 480, 180), tasks: ["Kanal izolyatsiyasi — 1-qavat", "VRF ichki bloklari — 1-qavat"] },
    { name: "Server xonasi", g: poly([540, 90], [780, 90], [780, 270], [660, 270], [540, 200]), tasks: ["VRF ichki bloklari — 1-qavat"] },
    { name: "Kasseta blok K-1", g: point(150, 180), tasks: ["VRF ichki bloklari — 1-qavat"] },
    { name: "Kasseta blok K-2", g: point(420, 180), tasks: ["VRF ichki bloklari — 1-qavat"] },
  ];
  await make("brb", "Ventilyatsiya va VRF — 1-qavat rejasi", "OV", [
    { note: null, day: -160, lines: ["BRB ma'muriy binosi", "1-qavat, OV-1", "Demo chizma v1"], zones: floor1Zones(false) },
    { note: "Diffuzorlar joyi o'zgardi (101, 103-xonalar)", day: -20, lines: ["BRB ma'muriy binosi", "1-qavat, OV-1", "Demo chizma v2 — diffuzorlar ko'chirildi"], zones: floor1Zones(true) },
  ]);

  const f2 = await make("brb", "Ventilyatsiya va VRF — 2-qavat rejasi", "OV", [
    {
      note: null,
      day: -60,
      lines: ["BRB ma'muriy binosi", "2-qavat, OV-2"],
      zones: [
        { name: "201–202 xonalar", g: rect(60, 330, 360, 170), tasks: ["Ventkanal montaji — 2-qavat", "Kanal izolyatsiyasi — 2-qavat"] },
        { name: "203–204 xonalar", g: rect(420, 330, 360, 170), tasks: ["Ventkanal montaji — 2-qavat", "VRF ichki bloklari — 2-qavat"] },
        { name: "Freon trassasi (koridor)", g: line([80, 300], [400, 300], [400, 220], [760, 220]), tasks: ["Freon trassasi — 1–2 qavatlar"] },
        { name: "Majlislar zali", g: rect(60, 90, 480, 180), tasks: ["Ventkanal montaji — 2-qavat", "Kanal izolyatsiyasi — 2-qavat", "Freon trassasi — 1–2 qavatlar"] },
        { name: "206–208 xonalar (VRF)", g: rect(540, 90, 240, 180), tasks: ["VRF ichki bloklari — 2-qavat"] },
      ],
    },
  ]);

  await make("brb", "Tom — tashqi bloklar va AHU", "OV", [
    {
      note: null,
      day: -40,
      lines: ["BRB ma'muriy binosi", "Tom rejasi"],
      zones: [
        { name: "AHU-1 / AHU-2 poydevori", g: rect(60, 330, 360, 170), tasks: ["AHU o'rnatish — tom"] },
        { name: "VRF tashqi bloklar maydoni", g: rect(420, 330, 360, 170), tasks: ["VRF tashqi bloklari — tom"] },
        { name: "Tom o'tishlari", g: line([150, 300], [690, 300]), tasks: ["BRB: tomdagi o'tishlarni teshish"] },
      ],
    },
  ]);

  await make("nest", "Nest One — tipik qavat (VRF)", "OV", [
    {
      note: null,
      day: -60,
      lines: ["Nest One biznes markazi", "Tipik qavat 1–4"],
      zones: [
        { name: "Freon magistrali", g: line([80, 300], [760, 300]), tasks: ["Freon trassasi — 1–4 qavatlar", "Nest One: freon quvurlari izolyatsiyasi"] },
        { name: "Drenaj trassasi", g: line([80, 280], [760, 280]), tasks: ["Nest One: drenaj trassasi 1–4 qavat"] },
        { name: "Ofis bloki A", g: rect(60, 330, 360, 170), tasks: ["VRF ichki bloklari — 5–10 qavatlar"] },
        { name: "Ofis bloki B", g: rect(420, 330, 360, 170), tasks: ["VRF ichki bloklari — 5–10 qavatlar", "VRF tizimini elektrga ulash"] },
      ],
    },
  ]);

  // Remarks pinned on the 2nd floor drawing.
  const pins: [string, number, number][] = [
    ["VRF ichki bloklari — 2-qavat", 0.72, 0.62],
    ["Freon trassasi — 1–4 qavatlar", 0.5, 0.5],
  ];
  for (const [title, x, y] of pins) {
    const tid = await taskId("brb", title);
    const r = tid ? await db.remark.findFirst({ where: { taskId: tid } }) : null;
    if (r) await db.remark.update({ where: { id: r.id }, data: { drawingVersionId: f2.id, drawingPage: 1, posX: x, posY: y } });
  }
  const n = ((await db.remark.findFirst({ where: { companyId: cid }, orderBy: { number: "desc" } }))?.number ?? 0) + 1;
  await db.remark.create({
    data: {
      companyId: cid,
      projectId: ctx.projects.brb,
      number: n,
      drawingVersionId: f2.id,
      drawingPage: 1,
      posX: 0.3,
      posY: 0.68,
      description: "Majlislar zalida diffuzor flanetsi noto'g'ri o'rnatilgan",
      priority: "MEDIUM",
      status: "ASSIGNED",
      responsibleUserId: ctx.users.foreman,
      deadline: d(4),
      createdById: ctx.users.inspector,
    },
  });
}
