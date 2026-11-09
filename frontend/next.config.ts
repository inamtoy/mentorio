import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// The Admin portal used to live at the site root (`/students`, `/finance`,
// ...) before `/` became the public landing page. Keeps admins' bookmarks
// and browser history working. Permanent 308: keeps the method and body,
// and Next.js carries the query string over. Browsers cache a 308, so these
// root paths can't be reused for public pages later without breaking
// those cached redirects.
const LEGACY_ADMIN_SECTIONS = [
  "attendance",
  "courses",
  "exams",
  "finance",
  "groups",
  "homework",
  "notifications",
  "reports",
  "schedule",
  "settings",
  "students",
  "teachers",
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Self-contained server bundle for the production image (frontend/Dockerfile).
  output: "standalone",
  // No `X-Powered-By: Next.js` — it only tells scanners which exploits to try.
  poweredByHeader: false,
  async redirects() {
    return LEGACY_ADMIN_SECTIONS.flatMap((section) => [
      { source: `/${section}`, destination: `/admin/${section}`, permanent: true },
      { source: `/${section}/:path*`, destination: `/admin/${section}/:path*`, permanent: true },
    ]);
  },
};

export default withNextIntl(nextConfig);
