import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** `new Date("2026-08-15")` parses a bare date-only string as UTC midnight,
 * per spec — formatting that in any timezone behind UTC silently shifts it
 * back a day (a due_date of "2026-08-15" rendering as "Aug 14"). Parses it
 * as a local calendar date instead. Pairs with `toLocalIsoDate()` below
 * (the encoder); exported since `components/ui/calendar.tsx` needs the
 * same round-trip and every page-local `toLocalIso()` this mirrors was a
 * separate copy-pasted duplicate rather than a shared one. A full ISO
 * timestamp (has a "T") is a real point in time and is left to `new
 * Date()` as-is. */
export function parseLocalDate(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Inverse of `parseLocalDate()` — "YYYY-MM-DD" in the *local* calendar,
 * not `.toISOString()`'s UTC one (which has the same day-shift problem in
 * reverse). */
export function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** `N` days from today (negative = past, positive = future) as a local
 * "YYYY-MM-DD" string — the shared home for a rolling-window default that
 * used to be copy-pasted per page (Admin Attendance/Finance, Super-Admin
 * Payments/Audit Logs, Admin Schedule's list view), each hand-rolling
 * `new Date(); d.setDate(d.getDate() - N); toLocalIsoDate(d)` inline. */
export function daysFromTodayIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalIsoDate(d);
}

/** The 3 options Admin/Teacher/Student Settings' Region tab offers — see
 * backend/foundation/services.py's DATE_FORMAT_CHOICES for the server-side
 * twin of this list. Defined here (not in lib/api/settings.ts) since
 * that's the consumer of this type, not its source. */
export type DateFormat = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";

/** `dateFormat` omitted keeps this call site's original "Aug 15, 2026"
 * en-US style (still the default everywhere a caller hasn't been updated
 * to pass the viewer's real preference yet). Passed, it renders the exact
 * numeric token the user picked in Settings > Region instead — the one
 * user-visible effect of that setting, see mentorio-remaining-work's
 * "Timezone/date-format fields" item. */
export function formatDate(date: string | Date, dateFormat?: DateFormat) {
  const parsed = typeof date === "string" && DATE_ONLY.test(date) ? parseLocalDate(date) : new Date(date);
  if (!dateFormat) {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(parsed);
  }
  const dd = String(parsed.getDate()).padStart(2, "0");
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const yyyy = parsed.getFullYear();
  if (dateFormat === "MM/DD/YYYY") return `${mm}/${dd}/${yyyy}`;
  if (dateFormat === "DD/MM/YYYY") return `${dd}/${mm}/${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

export function formatTime(time: string) {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${ampm}`;
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
