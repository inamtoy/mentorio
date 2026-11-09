import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Public pages only — add each new marketing page here.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 }];
}
