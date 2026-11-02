import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Self-contained server bundle for the production image (frontend/Dockerfile).
  output: "standalone",
  // No `X-Powered-By: Next.js` — it only tells scanners which exploits to try.
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
