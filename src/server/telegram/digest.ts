/**
 * Daily activity digest posted to a Telegram group: who used the platform, work sessions with
 * confirmations ("A guruh: B, C tasdiqladi, D tasdiqlamadi"), started/finished tasks, overdue tasks.
 * No "server-only" import: runs from the background scheduler.
 */
import { db } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { tashkentDayStart, tashkentHour } from "../backup";
import { escapeHtml as e, sendLongMessage } from "./api";
import { openSecret } from "@/lib/crypto-box";

function fmtDate(d: Date) {
  const local = new Date(d.getTime() + 5 * 3600000);
  return `${String(local.getUTCDate()).padStart(2, "0")}.${String(local.getUTCMonth() + 1).padStart(2, "0")}.${local.getUTCFullYear()}`;
}

export async function buildDigest(companyId: string, now = new Date()): Promise<string> {
  const since = tashkentDayStart(now);
  const dayDate = new Date(Date.UTC(new Date(since.getTime() + 5 * 3600000).getUTCFullYear(), new Date(since.getTime() + 5 * 3600000).getUTCMonth(), new Date(since.getTime() + 5 * 3600000).getUTCDate()));
  const [users, sessions, events, overdue] = await Promise.all([
    db.user.findMany({ where: { companyId, active: true }, select: { id: true, name: true, lastLoginAt: true } }),
    db.workSession.findMany({
      where: { companyId, OR: [{ date: dayDate }, { createdAt: { gte: since } }] },
      include: {
        task: { select: { number: true, title: true, unit: true, project: { select: { code: true, name: true } } } },
        group: { select: { name: true } },
        leader: { select: { fullName: true } },
        members: { include: { employee: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.taskEvent.findMany({
      where: { task: { companyId }, at: { gte: since }, type: { in: ["START", "FINISH", "PROGRESS", "PROBLEM"] } },
      include: { task: { select: { number: true, title: true } }, employee: { select: { fullName: true } }, user: { select: { name: true } } },
      orderBy: { at: "asc" },
    }),
    db.task.count({ where: { companyId, status: { notIn: ["APPROVED", "CANCELLED"] }, deadline: { lt: dayDate } } }),
  ]);

  const lines: string[] = [`📊 <b>Kunlik hisobot — ${fmtDate(now)}</b>`, ""];
  const loggedIn = users.filter((u) => u.lastLoginAt && u.lastLoginAt >= since);
  const active = new Set([...loggedIn.map((u) => u.id), ...events.map((x) => x.userId).filter(Boolean)]);
  lines.push(`👥 Platformada faol: <b>${active.size}</b> / ${users.length}`);
  if (loggedIn.length) lines.push(`Kirganlar: ${loggedIn.map((u) => e(u.name)).join(", ")}`);
  lines.push("");

  if (sessions.length) {
    lines.push("🛠 <b>Ish sessiyalari</b>");
    for (const s of sessions) {
      const who = s.group?.name ?? s.leader?.fullName ?? "—";
      lines.push(
        `• <b>${e(who)}</b> — #${s.task.number} ${e(s.task.title)} (${e(s.task.project.code)}): <b>${formatNumber(Number(s.quantity), 1)} ${e(s.unit ?? s.task.unit ?? "")}</b>`,
      );
      const confirmed = s.members.filter((m) => m.confirmation === "CONFIRMED").map((m) => e(m.employee.fullName));
      const disputed = s.members.filter((m) => m.confirmation === "DISPUTED").map((m) => e(m.employee.fullName));
      const pending = s.members.filter((m) => m.confirmation === "PENDING").map((m) => e(m.employee.fullName));
      if (confirmed.length) lines.push(`   ✅ Tasdiqladi: ${confirmed.join(", ")}`);
      if (pending.length) lines.push(`   ⏳ Tasdiqlamadi: ${pending.join(", ")}`);
      if (disputed.length) lines.push(`   ❌ E'tiroz bildirdi: ${disputed.join(", ")}`);
    }
    lines.push("");
  }

  const byType = (t: string) => events.filter((x) => x.type === t);
  const actor = (x: (typeof events)[number]) => e(x.employee?.fullName ?? x.user?.name ?? "—");
  if (byType("START").length) {
    lines.push("▶️ <b>Ishni boshladi</b>");
    for (const x of byType("START")) lines.push(`• ${actor(x)} — #${x.task.number} ${e(x.task.title)}`);
    lines.push("");
  }
  if (byType("PROGRESS").length) {
    lines.push("📈 <b>Bajarilish foizi</b>");
    for (const x of byType("PROGRESS")) lines.push(`• ${actor(x)} — #${x.task.number} ${e(x.task.title)}: ${x.percent ?? 0}%`);
    lines.push("");
  }
  if (byType("FINISH").length) {
    lines.push("🏁 <b>Tugatdi</b>");
    for (const x of byType("FINISH")) lines.push(`• ${actor(x)} — #${x.task.number} ${e(x.task.title)}`);
    lines.push("");
  }
  if (byType("PROBLEM").length) {
    lines.push("⚠️ <b>Muammolar</b>");
    for (const x of byType("PROBLEM")) lines.push(`• ${actor(x)} — #${x.task.number}: ${e(x.note ?? "")}`);
    lines.push("");
  }
  if (overdue > 0) lines.push(`⏰ Muddati o'tgan tasklar: <b>${overdue}</b>`);
  if (!sessions.length && !events.length) lines.push("Bugun ish sessiyalari va task harakatlari qayd etilmagan.");
  return lines.join("\n");
}

export async function sendDigest(companyId: string) {
  const c = await db.company.findUniqueOrThrow({ where: { id: companyId } });
  if (!c.telegramBotToken || !c.telegramChatId) throw new Error("Telegram is not configured");
  await sendLongMessage(openSecret(c.telegramBotToken)!, c.telegramChatId, await buildDigest(companyId));
  await db.company.update({ where: { id: companyId }, data: { telegramLastDigestAt: new Date() } });
}

/** Once a day at the configured Tashkent hour. */
export async function maybeTelegramDigests() {
  const companies = await db.company.findMany({
    where: { isDemo: false, telegramBotToken: { not: null }, telegramChatId: { not: null } },
  });
  const since = tashkentDayStart();
  for (const c of companies) {
    if (tashkentHour() < c.telegramDigestHour) continue;
    if (c.telegramLastDigestAt && c.telegramLastDigestAt >= since) continue;
    try {
      await sendDigest(c.id);
    } catch (err) {
      console.error("[telegram]", c.id, err);
    }
  }
}
