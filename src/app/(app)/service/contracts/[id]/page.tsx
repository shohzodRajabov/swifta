import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { recordMoney } from "@/lib/money-value";
import { formatNumber } from "@/lib/format";
import { plannedVisits } from "@/lib/sla";
import { formatDate, toDateOnly } from "@/lib/utils";
import { Badge, Card, CardHeader, Empty, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Money } from "@/components/money";
import { TicketStatusBadge } from "@/components/service-bits";
import { ticketCost } from "@/server/service/service";
import { ContractForm } from "../contract-form";
import { planVisits, saveContract } from "../../actions";
import { UT } from "@/components/user-text";

export default async function ContractPage({ params }: PageProps<"/service/contracts/[id]">) {
  const { id } = await params;
  const user = await requirePermission("service.view");
  const contract = await db.serviceContract.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      client: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      tickets: { orderBy: [{ dueAt: "asc" }], include: { parts: { select: { qty: true, unitCostUzs: true } }, responsible: { select: { name: true } } } },
    },
  });
  if (!contract) notFound();
  const t = await getTranslations();
  const edit = can(user, "service.edit");
  const today = toDateOnly(new Date());
  const visits = plannedVisits(contract.startDate, contract.endDate, contract.frequency);
  const plannedDone = contract.tickets.filter((x) => x.planned && ["RESOLVED", "CLOSED"].includes(x.status)).length;
  const missing = visits.filter((v) => v >= today && !contract.tickets.some((x) => x.planned && x.dueAt?.toISOString().slice(0, 10) === v.toISOString().slice(0, 10))).length;
  const costs = contract.tickets.reduce((s, x) => s + ticketCost(x).total, 0);
  const charges = contract.tickets.reduce((s, x) => s + Number(x.chargeUzs), 0);
  const [clients, projects] = edit
    ? await Promise.all([
        db.client.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        db.project.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      ])
    : [[], []];

  return (
    <>
      <PageHeader
        title={`${t("service.contract")} ${contract.number}`}
        back={{ href: "/service?tab=contracts", label: t("service.title") }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/clients/${contract.client.id}`} className="hover:text-primary">
              {contract.client.name}
            </Link>
            {contract.project && (
              <>
                ·
                <Link href={`/projects/${contract.project.id}`} className="hover:text-primary">
                  {contract.project.name}
                </Link>
              </>
            )}
            <Badge tone={contract.status === "ACTIVE" && contract.endDate >= today ? "success" : "neutral"}>
              {contract.status === "ACTIVE" && contract.endDate < today ? t("service.expired") : t(`contractStatus.${contract.status}`)}
            </Badge>
          </span>
        }
        actions={
          edit && (
            <LinkButton href={`/service/tickets/new?contract=${contract.id}`}>
              <Plus className="size-4" aria-hidden />
              {t("service.newTicket")}
            </LinkButton>
          )
        }
      />
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted">{t("service.period")}</div>
          <div className="num mt-1 text-sm font-medium">
            {formatDate(contract.startDate)} — {formatDate(contract.endDate)}
          </div>
          <div className="text-xs text-muted">{t(`frequency.${contract.frequency}`)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">SLA</div>
          <div className="mt-1 text-sm font-medium">
            {contract.slaResponseHours ? t("service.slaShort", { r: String(contract.slaResponseHours), f: String(contract.slaResolveHours ?? "—") }) : t("service.slaDefault")}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">{t("service.visits")}</div>
          <div className="num mt-1 text-2xl font-semibold">
            {plannedDone} / {visits.length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">{t("service.contractPrice")}</div>
          <div className="mt-1">
            <Money value={recordMoney(contract)} align="left" />
          </div>
          <div className="num mt-1 text-xs text-muted">{t("service.contractCosts", { c: formatNumber(Math.round(costs)), b: formatNumber(Math.round(charges)) })}</div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title={t("service.tickets")}
          action={
            edit && missing > 0 ? (
              <ActionForm action={planVisits}>
                <input type="hidden" name="id" value={contract.id} />
                <SubmitButton variant="secondary">{t("service.planVisits", { n: String(missing) })}</SubmitButton>
              </ActionForm>
            ) : undefined
          }
        />
        {contract.tickets.length === 0 ? (
          <Empty>{t("service.noTickets")}</Empty>
        ) : (
          <Table>
            <tbody>
              {contract.tickets.map((x) => (
                <tr key={x.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/service/tickets/${x.id}`} className="font-medium hover:text-primary">
                      <span className="num text-muted">S-{x.number}</span> <UT>{x.title}</UT>
                    </Link>
                    {x.planned && <Badge tone="primary" className="ml-2">{t("service.planned")}</Badge>}
                  </Td>
                  <Td>
                    <TicketStatusBadge status={x.status} />
                  </Td>
                  <Td>{x.responsible?.name ?? "—"}</Td>
                  <Td className="num text-right">{formatDate(x.dueAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {contract.slaText && (
        <Card className="mt-6 p-5 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted">{t("service.slaText")}</div>
          <p className="mt-1 whitespace-pre-line">{contract.slaText}</p>
        </Card>
      )}

      {edit && (
        <Card className="mt-6">
          <details>
            <summary className="cursor-pointer px-5 py-3.5 text-sm font-semibold">{t("common.edit")}</summary>
            <div className="border-t border-border">
              <ContractForm action={saveContract.bind(null, contract.id)} contract={contract} clients={clients} projects={projects} />
            </div>
          </details>
        </Card>
      )}
    </>
  );
}
