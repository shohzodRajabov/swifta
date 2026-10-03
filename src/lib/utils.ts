import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalize a date to UTC midnight (matches Postgres `date` columns). */
export function toDateOnly(d: Date | string): Date {
  const x = typeof d === "string" ? new Date(d) : d;
  return new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()));
}

export function isoDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  const iso = isoDate(d);
  const [y, m, day] = iso.split("-");
  return `${day}.${m}.${y}`;
}
