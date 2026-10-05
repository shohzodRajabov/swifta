import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Prisma, ServiceTicketStatus } from "@prisma/client";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { recordMoney } from "@/lib/money-value";
import { slaHours, slaStatus, type Prio } from "@/lib/sla";
import { cn, formatDate, formatDateTime, toDateOnly } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { Badge, Button, Card, Empty, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { Money } from "@/components/money";
import { PriorityBadge } from "@/components/project-bits";
import { SlaBadge, TicketStatusBadge } from "@/components/service-bits";
import { ticketCost } from "@/server/service/service";

const TABS = ["tickets", "contracts", "warranty"] as const;
type Tab = (typeof TABS)[number];
const DAY = 86400000;

export default async function ServicePage({ searchParams }: PageProps<"/service">) {
  const user = await requirePermission("service.view");
  const sp = (await searchParams) as { tab?: string; status?: string; warranty?: string };
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "tickets";
  const t = await getTranslations();
  const today = toDateOnly(new Date());

  const [openTickets, contracts, warrantyProjects] = await Promise.all([
    db.serviceTicket.findMany({
      where: { companyId: user.companyId, status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS"] } },
      select: { reportedAt: true, respondedAt: true, resolvedAt: true, dueAt: true, priority: true, planned: true, serviceContract: { select: { slaResponseHours: true, slaResolveHours: true, slaBusinessHours: true } } },
    }),
    db.serviceContract.findMany({
      where: { companyId: user.companyId },
      include: { client: { select: { name: true } }, project: { select: { id: true, name: true } }, _count: { select: { tickets: true } } },
      orderBy: { endDate: "asc" },
    }),
    db.project.findMany({
      where: { companyId: user.companyId, warrantyEnd: { not: null } },
      include: { client: { select: { name: true } }, _count: { select: { serviceTickets: true } } },
      orderBy: { warrantyEnd: "asc" },
    }),
  ]);
  const breached = openTickets.filter((x) => !x.planned && slaStatus(x, slaHours(x.priority as Prio, x.serviceContract)).resolve === "BREACHED").length;
  const activeContracts = contracts.filter((c) => c.status === "ACTIVE" && c.endDate >= today);
  const inWarranty = warrantyProjects.filter((p) => p.warrantyEnd! >= today);
  const endingSoon = inWarranty.filter((p) => p.warrantyEnd!.getTime() - today.getTime() <= 60 * DAY).length;

  return (
    <>
      <PageHeader
        title={t("service.title")}
        subtitle={t("service.subtitle")}
        actions={
          can(user, "service.edit") && (
            <>
              <LinkButton href="/service/contracts/new" variant="secondary">
                <Plus className="size-4" aria-hidden />
                {t("service.newContract")}
              </LinkButton>
              <LinkButton href="/service/tickets/new">
                <Plus className="size-4" aria-hidden />
                {t("service.newTicket")}
              </LinkButton>
            </>
          )
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(
          [
            [t("service.openTickets"), openTickets.length, "tickets", false],
            [t("service.slaBreached"), breached, "tickets", breached > 0],
            [t("service.activeContracts"), activeContracts.length, "contracts", false],
            [t("service.warrantyEnding"), endingSoon, "warranty", endingSoon > 0],
          ] as [string, number, Tab, boolean][]
        ).map(([label, value, to, danger]) => (
          <Link key={label} href={`/service?tab=${to}`}>
            <Card className="p-4 transition-colors hover:border-primary/50">
              <div className="text-xs text-muted">{label}</div>
              <div className={cn("num mt-1 text-2xl font-semibold", danger && "text-danger")}>{value}</div>
            </Card>
          </Link>
        ))}
      </div>
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((k) => (
          <Link
            key={k}
            href={`/service?tab=${k}`}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", tab === k ? "border-primary font-medium text-primary" : "border-transparent text-muted hover:text-text")}
          >
            {t(`service.tab_${k}`)}
          </Link>
        ))}
      </nav>
      {tab === "tickets" && <TicketsTab companyId={user.companyId} status={sp.status} warranty={sp.warranty} showMoney={can(user, "finance.view") || can(user, "service.edit")} />}
      {tab === "contracts" && (
        <Card>
          {contracts.length === 0 ? (
            <Empty>{t("service.noContracts")}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("service.contract")}</Th>
                  <Th>{t("service.period")}</Th>
                  <Th>{t("service.frequency")}</Th>
                  <Th>SLA</Th>
                  <Th className="text-right">{t("common.amount")}</Th>
                  <Th className="text-right">{t("service.tickets")}</Th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const expired = c.endDate < today;
                  const ending = !expired && c.endDate.getTime() - today.getTime() <= 30 * DAY;
                  return (
                    <tr key={c.id} className="hover:bg-surface-2/60">
                      <Td>
                        <Link href={`/service/contracts/${c.id}`} className="font-medium hover:text-primary">
                          {c.number} · {c.client.name}
                        </Link>
                        {c.project && <div className="text-xs text-muted">{c.project.name}</div>}
                      </Td>
                      <Td>
                        <div className="num">
                          {formatDate(c.startDate)} — {formatDate(c.endDate)}
                        </div>
                        {c.status !== "ACTIVE" ? (
                          <Badge>{t(`contractStatus.${c.status}`)}</Badge>
                        ) : expired ? (
                          <Badge tone="danger">{t("service.expired")}</Badge>
                        ) : ending ? (
                          <Badge tone="warning">{t("service.endingSoon")}</Badge>
                        ) : null}
                      </Td>
                      <Td>{t(`frequency.${c.frequency}`)}</Td>
                      <Td className="text-xs">
                        {c.slaResponseHours ? t("service.slaShort", { r: String(c.slaResponseHours), f: String(c.slaResolveHours ?? "—") }) : "—"}
                      </Td>
                      <Td className="text-right">
                        <Money size="sm" value={recordMoney(c)} />
                      </Td>
                      <Td className="num text-right">{c._count.tickets}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}
      {tab === "warranty" && (
        <Card>
          {warrantyProjects.length === 0 ? (
            <Empty>{t("service.noWarranty")}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("projects.project")}</Th>
                  <Th>{t("service.warrantyPeriod")}</Th>
                  <Th className="text-right">{t("service.daysLeft")}</Th>
                  <Th className="text-right">{t("service.tickets")}</Th>
                </tr>
              </thead>
              <tbody>
                {warrantyProjects.map((p) => {
                  const left = Math.ceil((p.warrantyEnd!.getTime() - today.getTime()) / DAY);
                  return (
                    <tr key={p.id} className="hover:bg-surface-2/60">
                      <Td>
                        <Link href={`/projects/${p.id}`} className="font-medium hover:text-primary">
                          {p.name}
                        </Link>
                        <div className="text-xs text-muted">{p.client.name}</div>
                      </Td>
                      <Td className="num">
                        {formatDate(p.warrantyStart)} — {formatDate(p.warrantyEnd)}
                        {p.warrantyMonths && <span className="text-xs text-muted"> ({t("service.months", { n: String(p.warrantyMonths) })})</span>}
                      </Td>
                      <Td className="text-right">
                        {left < 0 ? <Badge>{t("service.warrantyOver")}</Badge> : <Badge tone={left <= 60 ? "warning" : "success"}>{t("service.days", { n: String(left) })}</Badge>}
                      </Td>
                      <Td className="num text-right">
                        <Link href={`/service?tab=tickets&warranty=${p.id}`} className="hover:text-primary">
                          {p._count.serviceTickets}
                        </Link>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

async function TicketsTab({ companyId, status, warranty, showMoney }: { companyId: string; status?: string; warranty?: string; showMoney: boolean }) {
  const t = await getTranslations();
  const where: Prisma.ServiceTicketWhereInput = {
    companyId,
    ...(status === "all" ? {} : status ? { status: status as ServiceTicketStatus } : { status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS", "RESOLVED"] } }),
    ...(warranty ? { projectId: warranty } : {}),
  };
  const tickets = await db.serviceTicket.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    take: 300,
    include: {
      client: { select: { name: true } },
      project: { select: { name: true } },
      responsible: { select: { name: true } },
      serviceContract: { select: { number: true, slaResponseHours: true, slaResolveHours: true, slaBusinessHours: true } },
      parts: { select: { qty: true, unitCostUzs: true } },
    },
  });
  return (
    <Card>
      <form className="flex flex-wrap gap-2 border-b border-border p-3">
        <input type="hidden" name="tab" value="tickets" />
        <Select name="status" defaultValue={status ?? ""} className="w-52">
          <option value="">{t("service.statusOpen")}</option>
          <option value="all">{t("common.all")}</option>
          {(["NEW", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED", "CANCELLED"] as const).map((s) => (
            <option key={s} value={s}>
              {t(`ticketStatus.${s}`)}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          {t("common.filter")}
        </Button>
      </form>
      {tickets.length === 0 ? (
        <Empty>{t("service.noTickets")}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t("service.ticket")}</Th>
              <Th>{t("common.status")}</Th>
              <Th>SLA</Th>
              <Th>{t("service.responsible")}</Th>
              {showMoney && <Th className="text-right">{t("service.costCharge")}</Th>}
            </tr>
          </thead>
          <tbody>
            {tickets.map((x) => {
              const sla = slaStatus(x, slaHours(x.priority as Prio, x.serviceContract));
              const cost = ticketCost(x);
              return (
                <tr key={x.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/service/tickets/${x.id}`} className="font-medium hover:text-primary">
                      <span className="num text-muted">S-{x.number}</span> {x.title}
                    </Link>
                    <div className="text-xs text-muted">
                      {x.client?.name ?? x.project?.name}
                      {x.project && x.client && ` · ${x.project.name}`}
                      {x.serviceContract && ` · ${x.serviceContract.number}`}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {x.isWarranty && <Badge tone="success">{t("service.warranty")}</Badge>}
                      {x.planned && <Badge tone="primary">{t("service.planned")}</Badge>}
                      {x.priority !== "MEDIUM" && <PriorityBadge priority={x.priority} />}
                    </div>
                  </Td>
                  <Td>
                    <TicketStatusBadge status={x.status} />
                    <div className="num mt-0.5 text-xs text-muted">{formatDateTime(x.reportedAt)}</div>
                  </Td>
                  <Td>
                    {!x.planned && (
                      <div className="flex flex-col items-start gap-1">
                        <SlaBadge state={sla.response} kind="response" />
                        <SlaBadge state={sla.resolve} kind="resolve" />
                      </div>
                    )}
                    <div className="num text-xs text-muted">{t("service.dueShort", { d: formatDateTime(sla.resolveDue) })}</div>
                  </Td>
                  <Td>{x.responsible?.name ?? "—"}</Td>
                  {showMoney && (
                    <Td className="num text-right text-xs">
                      {formatNumber(Math.round(cost.total))}
                      <div className="text-muted">{x.isWarranty ? t("service.notBilled") : formatNumber(Number(x.chargeUzs))}</div>
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
