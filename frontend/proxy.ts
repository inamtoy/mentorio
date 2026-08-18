import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

// Mirrors login page's ROLE_PORTAL_MAP (app/(auth)/login/page.tsx) — keep
// both in sync if a role or portal is ever added/renamed.
const ROLE_PORTAL_MAP: Record<string, string> = {
  super_admin: "/super-admin",
  center_admin: "/",
  admin: "/",
  teacher: "/teacher",
  student: "/student",
};

// Path prefixes that belong to a specific portal and the roles allowed in
// it. The admin portal is everything NOT claimed by one of the others
// (route group `(admin)` maps to `/`), so it's handled as a fallback rather
// than listed here.
const PORTAL_GUARDS: { prefix: string; roles: string[] }[] = [
  { prefix: "/super-admin", roles: ["super_admin"] },
  { prefix: "/teacher", roles: ["teacher"] },
  { prefix: "/student", roles: ["student"] },
];
const ADMIN_ROLES = ["center_admin", "admin"];

// Slash-boundary-aware prefix match — plain `pathname.startsWith(prefix)`
// would wrongly match "/students" (an Admin-portal page) against the
// "/student" (Student-portal) prefix.
function isUnderPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Presence + role guard. Presence: redirects to /login if neither auth
 * cookie is present. httpOnly cookies aren't readable by client JS, but
 * proxy runs server-side and receives the raw Cookie header regardless of
 * that flag.
 *
 * Role: also redirects a signed-in user away from a portal that isn't
 * theirs (e.g. a student hitting /teacher) using the `user_role` httpOnly
 * cookie the backend sets alongside the tokens (see
 * backend/common/cookies.py::set_auth_cookies). This does NOT decode or
 * verify the JWT, and is not itself the security boundary — real
 * authorization is enforced per-request by the backend's RBAC (see
 * backend/foundation, HasModulePermission). It exists to stop the frontend
 * from rendering another role's screens at all, rather than relying solely
 * on individual API calls 403ing underneath a half-rendered page.
 *
 * Fails open if `user_role` is missing on an otherwise-valid session (e.g.
 * a session started before this cookie existed) — the visitor is left on
 * whatever page they requested rather than being bounced, since we can't
 * tell where they *do* belong. They'll get a fresh role cookie next login
 * or token refresh.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => isUnderPrefix(pathname, path))) {
    return NextResponse.next();
  }

  const hasSession = request.cookies.has("access_token") || request.cookies.has("refresh_token");
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const role = request.cookies.get("user_role")?.value;
  if (role) {
    // Not under any of the three named portals = it's the Admin portal
    // (route group `(admin)` maps to `/`), which has no dedicated prefix
    // of its own to match against.
    const guard = PORTAL_GUARDS.find((g) => isUnderPrefix(pathname, g.prefix));
    const allowed = guard ? guard.roles.includes(role) : ADMIN_ROLES.includes(role);

    if (!allowed) {
      const home = ROLE_PORTAL_MAP[role];
      return NextResponse.redirect(new URL(home ?? "/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Static files under public/ (logo images, favicons, ...) were falling
  // through to the role guard below like any other page request — harmless
  // for Admin (whose portal is the "anything unclaimed" fallback, so it
  // always passed), but a Teacher/Student/Super-Admin session would have
  // its own <img src="/logo.png"> request redirected to an HTML page
  // instead of the image (no PORTAL_GUARDS prefix matches a bare asset
  // path, so it fell into the ADMIN_ROLES-only fallback and got treated as
  // a wrong-portal hit). Excluding any path with a file extension in its
  // last segment fixes this generically for every current and future
  // public/ asset, not just today's logo files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api|.*\\..*$).*)"],
};
