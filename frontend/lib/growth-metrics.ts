import { formatLocalizedDate } from "@/i18n/date-locale";
import type { Locale } from "@/i18n/locales";

// Shared month-bucketing helpers for the Super-Admin Dashboard and Reports
// pages' growth/revenue charts — both derive real trends from raw
// `created_at`/`payment_date` timestamps rather than storing any
// pre-aggregated snapshot ("derive, don't store", same approach as every
// rate/trend built this session). Centralized here once two pages needed
// the identical bucketing logic, unlike the small page-specific
// STATUS_CONFIG-style maps this app usually just repeats per page.

/** `"YYYY-MM"` for the calendar month a date string falls in. */
export function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The last `n` month keys, oldest first, ending with the current month. */
export function lastNMonthKeys(n: number): string[] {
  const keys: string[] = [];
  const base = new Date();
  base.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(base.getFullYear(), base.getMonth() - i, 1);
    keys.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** Short, locale-aware month name for a `"YYYY-MM"` key (chart axis label). */
export function monthLabel(key: string, locale: Locale): string {
  const [y, m] = key.split("-").map(Number);
  return formatLocalizedDate(new Date(y, m - 1, 1), locale, { month: "short" });
}

export const MONTH_WINDOW = 6;

/** A fresh `[]` literal on every render would make a useMemo dependency
 * array unstable (react-hooks/exhaustive-deps) even though the *content*
 * never differs while data is loading — one shared, stable empty array. */
export const EMPTY_ARRAY: never[] = [];
