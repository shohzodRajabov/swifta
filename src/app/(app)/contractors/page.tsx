import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Availability, Prisma } from "@prisma/client";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatPhone } from "@/lib/phone";
import { Badge, Button, Card, Empty, Input, LinkButton, Notice, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { Money } from "@/components/money";
import { AvailabilityBadge, RatingValue, ReliabilityValue } from "@/components/contractor-bits";
import { contractorScores, contractorWorkload } from "@/server/contractors/score";
import { contractorBalances } from "@/server/contractors/balances";

const SORTS = ["name", "rating", "reliability", "completed", "onTime"] as const;

export default async function ContractorsPage({ searchParams }: PageProps<"/contractors">) {
  const user = await requirePermission("contractors.view");
  const sp = (await searchParams) as { q?: string; spec?: string; region?: string; avail?: string; sort?: string; inactive?: string; minRating?: string };
  const t = await getTranslations();
  const sort = SORTS.includes(sp.sort as (typeof SORTS)[number]) ? (sp.sort as (typeof SORTS)[number]) : "name";
  const showMoney = can(user, "finance.view") || can(user, "contractorPayments.edit");

  const where: Prisma.ContractorWhereInput = {
    companyId: user.companyId,
    ...(sp.inactive === "1" ? {} : { active: true }),
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q.replace(/\D/g, "") || sp.q } }] } : {}),
    ...(sp.spec ? { specializations: { has: sp.spec } } : {}),
    ...(sp.region ? { regions: { has: sp.region } } : {}),
    ...(sp.avail ? { availability: sp.avail as Availability } : {}),
  };
  const [contractors, all, workTypes] = await Promise.all([
    db.contractor.findMany({ where, orderBy: { name: "asc" } }),
    db.contractor.findMany({ where: { companyId: user.companyId }, select: { specializations: true, regions: true } }),
    db.workType.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { sortOrder: "asc" }, select: { name: true } }),
  ]);
  const ids = contractors.map((c) => c.id);
  const [scores, workload, balances] = await Promise.all([
    contractorScores(user.companyId, ids),
    contractorWorkload(user.companyId),
    showMoney ? contractorBalances(user.companyId, ids) : Promise.resolve(null),
  ]);
  const specs = [...new Set([...workTypes.map((w) => w.name), ...all.flatMap((c) => c.specializations)])];
  const regions = [...new Set(all.flatMap((c) => c.regions))].sort();
  const minRating = Number(sp.minRating) || 0;
  const rows = contractors
    .map((c) => ({ c, s: scores.get(c.id), w: workload.get(c.id), b: balances?.get(c.id) }))
    .filter((r) => !minRating || (r.s?.rating ?? 0) >= minRating);
  const val = (r: (typeof rows)[number]) => {
    switch (sort) {
      case "rating":
        return r.s?.rating ?? -1;
      case "reliability":
        return r.s?.reliability ?? -1;
      case "completed":
        return r.s?.stats.verified ?? 0;
      case "onTime":
        return r.s?.stats.withDeadline ? r.s.stats.onTime / r.s.stats.withDeadline : -1;
      default:
        return 0;
    }
  };
  if (sort !== "name") rows.sort((a, b) => val(b) - val(a));

  return (
    <>
      <PageHeader
        title={t("contractors.title")}
        subtitle={t("contractors.subtitle")}
        actions={
          can(user, "contractors.edit") && (
            <LinkButton href="/contractors/new">
              <Plus className="size-4" aria-hidden />
              {t("contractors.new")}
            </LinkButton>
          )
        }
      />
      <Card className="mb-4">
        <form className="flex flex-wrap items-center gap-2 p-3">
          <Input name="q" defaultValue={sp.q} placeholder={t("contractors.searchPlaceholder")} className="w-52" />
          <Select name="spec" defaultValue={sp.spec ?? ""} className="w-56">
            <option value="">{t("contractors.allSpecs")}</option>
            {specs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select name="region" defaultValue={sp.region ?? ""} className="w-40">
            <option value="">{t("contractors.allRegions")}</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Select name="avail" defaultValue={sp.avail ?? ""} className="w-40">
            <option value="">{t("contractors.anyAvailability")}</option>
            {(["AVAILABLE", "BUSY", "UNAVAILABLE", "BLACKLISTED"] as const).map((a) => (
              <option key={a} value={a}>
                {t(`availability.${a}`)}
              </option>
            ))}
          </Select>
          <Select name="minRating" defaultValue={sp.minRating ?? ""} className="w-32">
            <option value="">{t("contractors.anyRating")}</option>
            {[3, 3.5, 4, 4.5].map((r) => (
              <option key={r} value={r}>
                ★ ≥ {r}
              </option>
            ))}
          </Select>
          <Select name="sort" defaultValue={sort} className="w-44">
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`contractors.sort_${s}`)}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-1.5 text-sm text-muted">
            <input type="checkbox" name="inactive" value="1" defaultChecked={sp.inactive === "1"} /> {t("employees.showInactive")}
          </label>
          <Button type="submit" variant="secondary">
            {t("common.filter")}
          </Button>
        </form>
      </Card>
      <div className="mb-4">
        <Notice>{t("contractors.factsHint")}</Notice>
      </div>
      <Card>
        {rows.length === 0 ? (
          <Empty>{t("contractors.empty")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("contractors.name")}</Th>
                <Th>{t("contractors.specializations")}</Th>
                <Th>{t("contractors.availabilityLabel")}</Th>
                <Th className="text-right">{t("contractors.rating")}</Th>
                <Th className="text-right">{t("contractors.reliability")}</Th>
                <Th className="text-right">{t("contractors.doneTasks")}</Th>
                <Th className="text-right">{t("contractors.onTime")}</Th>
                <Th className="text-right">{t("contractors.reworkRate")}</Th>
                {showMoney && <Th className="text-right">{t("contractors.payable")}</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, s, w, b }) => (
                <tr key={c.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/contractors/${c.id}`} className="font-medium hover:text-primary">
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted">
                      <span className="num">C-{c.number}</span> · {t(`contractorKind.${c.kind}`)}
                      {c.phone && <span className="num"> · {formatPhone(c.phone)}</span>}
                    </div>
                    {c.regions.length > 0 && <div className="text-xs text-muted">{c.regions.join(", ")}</div>}
                  </Td>
                  <Td>
                    <div className="flex max-w-72 flex-wrap gap-1">
                      {c.specializations.slice(0, 4).map((x) => (
                        <Badge key={x}>{x}</Badge>
                      ))}
                      {c.specializations.length > 4 && <span className="text-xs text-muted">+{c.specializations.length - 4}</span>}
                    </div>
                  </Td>
                  <Td>
                    <AvailabilityBadge availability={c.availability} busy={w?.tasks} />
                    {w && <div className="mt-0.5 max-w-48 truncate text-xs text-muted" title={w.projects.join(", ")}>{w.projects.join(", ")}</div>}
                  </Td>
                  <Td className="text-right">
                    <RatingValue rating={s?.rating} />
                    {s?.lowData && s.rating !== null && (
                      <div className="text-[10px] text-muted" title={t("contractors.lowDataHint")}>
                        {t("contractors.lowData")}
                      </div>
                    )}
                  </Td>
                  <Td className="text-right">
                    <ReliabilityValue value={s?.reliability} />
                  </Td>
                  <Td className="num text-right">
                    {s?.stats.verified ?? 0}
                    <span className="text-muted"> / {s?.stats.total ?? 0}</span>
                    <div className="text-xs text-muted">{t("contractors.projectsN", { n: String(s?.projects ?? 0) })}</div>
                  </Td>
                  <Td className="num text-right">{s?.stats.withDeadline ? `${Math.round((s.stats.onTime / s.stats.withDeadline) * 100)}%` : "—"}</Td>
                  <Td className="num text-right">
                    {s && s.stats.total - s.stats.active > 0 ? `${Math.min(100, Math.round((s.stats.reworked / (s.stats.total - s.stats.active)) * 100))}%` : "—"}
                  </Td>
                  {showMoney && (
                    <Td className="text-right">
                      {b ? <Money size="sm" value={b.payable} /> : <span className="text-muted">—</span>}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
