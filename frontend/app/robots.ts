import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Public: the landing page (and future marketing pages). Private: every
// portal, the API and the sign-in pages. proxy.ts also sends
// `X-Robots-Tag: noindex` on all of these, for links found elsewhere.
const PRIVATE_PATHS = [
  "/admin",
  "/super-admin",
  "/teacher",
  "/student",
  "/api/",
  "/login",
  "/forgot-password",
  "/change-password",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
