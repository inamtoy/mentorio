import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Public pages only — add marketing pages here when they exist.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 1 }];
}
