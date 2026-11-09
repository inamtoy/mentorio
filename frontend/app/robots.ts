import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Only the sign-in page is public; every portal (Admin lives at `/`, plus
// /super-admin, /teacher, /student) and the API are private. Allow /login
// is the longer match, so it wins over Disallow / for crawlers.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/login",
      disallow: ["/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
