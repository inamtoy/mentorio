import type { MetadataRoute } from "next";
import { LOCALES } from "@/i18n/locales";
import { landingPath } from "@/i18n/routing";
import { SITE_URL } from "@/lib/site";

const absolute = (path: string) => `${SITE_URL}${path}`;

// Public pages only — one entry per language version, each listing all of
// them as alternates (hreflang). Add each new marketing page here.
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LOCALES.map((locale) => [locale, absolute(landingPath(locale))]));
  return LOCALES.map((locale) => ({
    url: absolute(landingPath(locale)),
    changeFrequency: "monthly",
    priority: 1,
    alternates: { languages: { ...languages, "x-default": absolute("/") } },
  }));
}
