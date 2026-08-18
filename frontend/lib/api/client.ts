const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Envelope<T> {
  success: boolean;
  message: string;
  data: T;
}

/** Backend field-validation errors, e.g. `{"student_code": ["This field is required."]}`. */
export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  status: number;
  /** Set only for genuine per-field serializer validation errors — null for
   * everything else (401/403/404, or a generic error string), matching
   * common/exceptions.py::envelope_exception_handler's data shape. */
  fieldErrors: FieldErrors | null;

  constructor(message: string, status: number, fieldErrors: FieldErrors | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

function extractFieldErrors(data: unknown): FieldErrors | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as FieldErrors;
}

// A 401 from either of these already IS the definitive answer (bad
// credentials / dead refresh token) — never worth a refresh-and-retry.
// Attempting one on a failed login would misreport "wrong password" as a
// silent extra round-trip at best; on a failed refresh it would recurse.
const AUTH_PATHS_EXEMPT_FROM_REFRESH = ["/api/v1/auth/login/", "/api/v1/auth/refresh/"];

// Shared across every in-flight 401 so concurrent requests (a page firing
// several queries at once) trigger exactly one refresh call, not one per
// request — every waiter awaits the same promise instead of racing.
let refreshPromise: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/api/v1/auth/refresh/`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function doFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

/**
 * Every call sends `credentials: "include"` — the backend's auth tokens
 * live in httpOnly cookies, never in JS-readable storage, so the browser
 * must be told to attach/accept them on every cross-port request.
 *
 * A 401 here almost always means the short-lived (15 min)
 * ACCESS_TOKEN_LIFETIME expired mid-session, not that the user is actually
 * signed out — the refresh token cookie easily outlives it (30 days). Left
 * unhandled, every query on a page left open past 15 minutes silently
 * fails and — worse — several call sites fall back to an empty array/list
 * on error, rendering a deceptively normal "0 records" state instead of an
 * auth error (see educore-frontend-architecture memory's "session-long
 * auth gotcha", hit for real multiple times across two verification
 * sessions). Rather than surface that as a hard error, refresh once and
 * retry the original request transparently; only if the refresh itself
 * fails (refresh token also expired/revoked) does the original 401 fall
 * through to the caller, same as before this existed.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return apiFetchWithRefresh<T>(path, init, false);
}

async function apiFetchWithRefresh<T>(path: string, init: RequestInit, isRetry: boolean): Promise<T> {
  const response = await doFetch(path, init);

  if (response.status === 401 && !isRetry && !AUTH_PATHS_EXEMPT_FROM_REFRESH.includes(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiFetchWithRefresh<T>(path, init, true);
    }
  }

  const body = (await response.json().catch(() => null)) as Envelope<T> | null;

  if (!response.ok || !body || !body.success) {
    throw new ApiError(body?.message ?? "Request failed.", response.status, extractFieldErrors(body?.data));
  }

  return body.data;
}

export interface PaginatedEnvelope<T> {
  results: T[];
  pagination: { count: number; page: number; pages: number };
}

/**
 * Fetches every page and concatenates results. The backend hard-caps
 * page_size at 100 (`common/pagination.py::EnvelopePageNumberPagination
 * .max_page_size`) — a single request with a bigger page_size is silently
 * clamped back down, so any "give me everything in this org" list call with
 * more than 100 rows was getting truncated with no error and no sign
 * anything was missing (first found in exams' Admin oversight page, then
 * confirmed to be the same bug shape across most of this file's siblings —
 * see the educore-frontend-architecture memory entry on it).
 *
 * Only appropriate for a genuinely *bounded* list (students, teachers,
 * groups, a group's roster, one student's/exam's results, …) where "all of
 * it" is still a reasonable single page-load. Do NOT reach for this on a
 * list that grows without bound over the org's lifetime with no natural cap
 * (audit logs, an unfiltered lesson/attendance history) — looping every
 * page there risks hammering the backend and hanging the tab instead of
 * just being wrong. Those need a bounded default filter (e.g. a default
 * date range) or real server-side pagination UI instead.
 *
 * Builds a fresh `URLSearchParams` per request instead of mutating the
 * caller's — the caller's object is left exactly as passed in, so it's
 * still safe to log/reuse/inspect afterward. Page 1 goes first (it's the
 * only one that reveals how many pages exist); pages 2..N are then fetched
 * concurrently via `Promise.all` rather than one-at-a-time, since each is
 * independent — a 10-page list costs ~2 round-trips of wall-clock time
 * instead of ~10.
 */
export interface Page<T> {
  results: T[];
  page: number;
  pageCount: number;
  totalCount: number;
}

/**
 * Fetches exactly one page — the real, UI-driven counterpart to
 * `fetchAllPages` below. Use this for any top-level "list page" that has
 * (or should have) its own `<Pagination>` control: the caller owns the
 * `page` state, passes it in, and gets back enough metadata
 * (`pageCount`/`totalCount`) to render the control and a "N results"
 * label. This is the actual fix for the truncation bug class
 * `fetchAllPages` patches over by hiding it (see that function's own
 * comment) — a list that's genuinely too big for one page-load should
 * page through it in the UI, not fetch it all into memory at once.
 */
export async function fetchPage<T>(path: string, query: URLSearchParams, page: number, pageSize = 20): Promise<Page<T>> {
  const q = new URLSearchParams(query);
  q.set("page_size", String(pageSize));
  q.set("page", String(page));
  const data = await apiFetch<PaginatedEnvelope<T>>(`${path}?${q}`);
  return {
    results: data.results,
    page: data.pagination.page,
    pageCount: data.pagination.pages,
    totalCount: data.pagination.count,
  };
}

export async function fetchAllPages<T>(path: string, query: URLSearchParams): Promise<T[]> {
  const withPage = (page: number) => {
    const q = new URLSearchParams(query);
    q.set("page_size", "100");
    q.set("page", String(page));
    return q;
  };

  const first = await apiFetch<PaginatedEnvelope<T>>(`${path}?${withPage(1)}`);
  if (first.pagination.pages <= 1) return first.results;

  const rest = await Promise.all(
    Array.from({ length: first.pagination.pages - 1 }, (_, i) =>
      apiFetch<PaginatedEnvelope<T>>(`${path}?${withPage(i + 2)}`)
    )
  );
  return [...first.results, ...rest.flatMap((r) => r.results)];
}
