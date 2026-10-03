"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslations } from "next-intl";
import { formatUzs, formatUzsCompact } from "@/lib/format";

const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;
function useCompact() {
  const t = useTranslations("money");
  return (v: number) => formatUzsCompact(v, { bn: t("bn"), mn: t("mn") });
}
const tooltipStyle = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--text)",
  },
  labelStyle: { color: "var(--muted)" },
};

export function MonthlyChart({
  data,
  labels,
}: {
  data: { month: string; revenue: number; expense: number; profit: number }[];
  labels: { revenue: string; expense: string; profit: string };
}) {
  const compact = useCompact();
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} tickFormatter={compact} width={70} />
        <Tooltip {...tooltipStyle} formatter={(v) => formatUzs(Number(v))} cursor={{ fill: "var(--surface-2)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" name={labels.revenue} fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expense" name={labels.expense} fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line dataKey="profit" name={labels.profit} stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3 }} type="linear" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function StageChart({ data }: { data: { name: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...axis} />
        <YAxis type="category" dataKey="name" width={140} {...axis} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "var(--surface-2)" }} />
        <Bar dataKey="count" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={20} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PlanActualChart({
  data,
  labels,
}: {
  data: { name: string; plan: number; actual: number }[];
  labels: { plan: string; actual: string };
}) {
  const compact = useCompact();
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" horizontal={false} />
        <XAxis type="number" {...axis} tickFormatter={compact} />
        <YAxis type="category" dataKey="name" width={150} {...axis} />
        <Tooltip {...tooltipStyle} formatter={(v) => formatUzs(Number(v))} cursor={{ fill: "var(--surface-2)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="plan" name={labels.plan} fill="var(--chart-4)" radius={[0, 4, 4, 0]} maxBarSize={14} />
        <Bar dataKey="actual" name={labels.actual} fill="var(--chart-2)" radius={[0, 4, 4, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
