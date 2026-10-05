import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** The company works in Tashkent time (UTC+5); calendar days are counted there, not in the server's zone. */
export const TIME_ZONE = "Asia/Tashkent";
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar day (YYYY-MM-DD) of an instant in Tashkent. Dates stored at UTC midnight keep their day. */
function tashkentDay(x: Date): string {
  return dayFormat.format(x);
}

/** Normalize to the Tashkent calendar day at UTC midnight (matches Postgres `date` columns). */
export function toDateOnly(d: Date | string): Date {
  const x = typeof d === "string" ? new Date(d) : d;
  return new Date(`${tashkentDay(x)}T00:00:00Z`);
}

/** Today's date in Tashkent (UTC midnight). */
export function today(): Date {
  return toDateOnly(new Date());
}

export function isoDate(d: Date | null | undefined): string {
  if (!d) return "";
  return tashkentDay(d);
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  const iso = isoDate(d);
  const [y, m, day] = iso.split("-");
  return `${day}.${m}.${y}`;
}

/** dd.mm.yyyy hh:mm in the company's time zone (Tashkent). */
export function formatDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}
