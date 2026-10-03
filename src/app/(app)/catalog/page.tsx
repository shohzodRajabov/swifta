import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatNumber, formatQty, formatUsd, formatUzs } from "@/lib/format";
import { Badge, Button, Card, Empty, Input, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui";

export default async function CatalogPage({ searchParams }: PageProps<"/catalog">) {
  const user = await requirePermission("catalog.view");
  const sp = (await searchParams) as { q?: string; category?: string };
  const t = await getTranslations();
  const canEdit = can(user.role, "catalog.edit");
  const showPrices = canEdit || can(user.role, "finance.view") || can(user.role, "bom.edit");

  const categories = await db.productCategory.findMany({
    where: { companyId: user.companyId },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });
  const catName = (c: { key: string | null; name: string }) => (c.key ? t(`productCategories.${c.key}`) : c.name);

  const where: Prisma.ProductWhereInput = { companyId: user.companyId };
  if (sp.category) where.categoryId = sp.category;
  if (sp.q)
    where.OR = [
      { name: { contains: sp.q, mode: "insensitive" } },
      { sku: { contains: sp.q, mode: "insensitive" } },
      { model: { contains: sp.q, mode: "insensitive" } },
      { manufacturer: { contains: sp.q, mode: "insensitive" } },
    ];
  const products = await db.product.findMany({ where, include: { category: true }, orderBy: [{ name: "asc" }], take: 500 });
  const price = (v: Prisma.Decimal, cur: string) => (cur === "USD" ? formatUsd(Number(v)) : `${formatUzs(Number(v))} ${t("money.sum")}`);

  return (
    <>
      <PageHeader
        title={t("catalog.title")}
        actions={
          canEdit && (
            <LinkButton href="/catalog/new">
              <Plus className="size-4" aria-hidden />
              {t("catalog.new")}
            </LinkButton>
          )
        }
      />
      <Card>
        <form className="flex flex-wrap gap-2 border-b border-border p-3">
          <Input name="q" defaultValue={sp.q} placeholder={t("common.search")} className="max-w-xs" />
          <Select name="category" defaultValue={sp.category ?? ""} className="max-w-64">
            <option value="">
              {t("catalog.category")}: {t("common.all")}
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {catName(c)} ({c._count.products})
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            {t("common.filter")}
          </Button>
        </form>
        {products.length === 0 ? (
          <Empty>{t("catalog.empty")}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("catalog.sku")}</Th>
                <Th>{t("catalog.name")}</Th>
                <Th>{t("catalog.category")}</Th>
                <Th>{t("catalog.manufacturer")}</Th>
                <Th>{t("catalog.unit")}</Th>
                {showPrices && <Th className="text-right">{t("catalog.purchasePrice")}</Th>}
                {showPrices && <Th className="text-right">{t("catalog.salePrice")}</Th>}
                <Th className="text-right">{t("catalog.minStock")}</Th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className={p.active ? "hover:bg-surface-2/60" : "opacity-50"}>
                  <Td className="num text-muted">{p.sku}</Td>
                  <Td>
                    {canEdit ? (
                      <Link href={`/catalog/${p.id}`} className="font-medium hover:text-primary">
                        {p.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{p.name}</span>
                    )}
                    {p.model && <div className="text-xs text-muted">{p.model}</div>}
                  </Td>
                  <Td>
                    <Badge>{catName(p.category)}</Badge>
                  </Td>
                  <Td>{p.manufacturer ?? "—"}</Td>
                  <Td>{p.unit}</Td>
                  {showPrices && <Td className="num text-right">{price(p.purchasePrice, p.purchaseCurrency)}</Td>}
                  {showPrices && <Td className="num text-right">{price(p.salePrice, p.saleCurrency)}</Td>}
                  <Td className="num text-right">{Number(p.minStock) ? formatQty(Number(p.minStock)) : formatNumber(0)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
