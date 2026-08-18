import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  /** 1-indexed current page. */
  page: number;
  /** Total number of pages — component renders nothing when <= 1. */
  pageCount: number;
  onPageChange: (page: number) => void;
  /** aria-labels for the prev/next icon buttons — English defaults, pass
   * translated ones from the calling page if desired (same opt-in pattern
   * as DataTable's emptyMessage prop; this component doesn't call
   * useTranslations() itself since it's shared across every portal's own
   * message namespace). */
  prevLabel?: string;
  nextLabel?: string;
  className?: string;
}

// Windowed page-number list: always shows first/last, the current page,
// and one neighbor on each side, collapsing the rest into a single "…" —
// keeps the control a fixed, small width regardless of how many pages
// there are (a platform-wide query can realistically page into the
// hundreds), rather than rendering every page number.
function pageWindow(page: number, pageCount: number): (number | "…")[] {
  const window = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const sorted = [...window].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);

  const result: (number | "…")[] = [];
  let prev: number | null = null;
  for (const p of sorted) {
    if (prev !== null && p - prev > 1) result.push("…");
    result.push(p);
    prev = p;
  }
  return result;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  prevLabel = "Previous page",
  nextLabel = "Next page",
  className,
}: PaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav className={cn("flex items-center justify-center gap-1", className)} aria-label="Pagination">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label={prevLabel}
        className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {pageWindow(page, pageCount).map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="h-8 w-8 flex items-center justify-center text-sm text-slate-400">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "h-8 min-w-8 px-2 flex items-center justify-center rounded-lg text-sm font-medium transition-colors",
              p === page ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
        aria-label={nextLabel}
        className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none transition-colors"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
