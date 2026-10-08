/** Role slug → the portal's home path. Shared by the login page, the forced
 * password-change page and proxy.ts — add a role or portal here only. */
export const ROLE_PORTAL_MAP: Record<string, string> = {
  super_admin: "/super-admin",
  center_admin: "/",
  admin: "/",
  teacher: "/teacher",
  student: "/student",
};
