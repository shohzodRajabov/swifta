// Shared (client + server) number formatting. Thin spaces keep grouping locale-neutral.

const GROUP = " ";

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
}

export function formatNumber(value: number, decimals = 0): string {
  const sign = value < 0 ? "−" : "";
  const fixed = Math.abs(value).toFixed(decimals);
  const [i, d] = fixed.split(".");
  return sign + group(i) + (d ? "," + d : "");
}

export function formatQty(value: number): string {
  return formatNumber(value, Number.isInteger(value) ? 0 : 2);
}

export function formatUzs(value: number): string {
  return formatNumber(Math.round(value));
}

export function formatUsd(value: number): string {
  const sign = value < 0 ? "−" : "";
  return `${sign}$${formatNumber(Math.abs(value), Math.abs(value) < 1000 ? 2 : 0)}`;
}

/** Compact form for KPI tiles: 1.2 mlrd, 345 mln. */
export function formatUzsCompact(value: number, labels: { bn: string; mn: string }): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}${formatNumber(abs / 1e9, 2)} ${labels.bn}`;
  if (abs >= 1e6) return `${sign}${formatNumber(abs / 1e6, 1)} ${labels.mn}`;
  return formatUzs(value);
}

export function formatPercent(value: number | null): string {
  if (value === null || !isFinite(value)) return "—";
  return `${formatNumber(value, 1)}%`;
}
