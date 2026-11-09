import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALES } from "./locales";

/** URL-prefixed locales for the PUBLIC pages only (landing): uz at `/`,
 * ru at `/ru`, en at `/en`. proxy.ts runs next-intl's middleware for those
 * paths alone; the portals keep the plain NEXT_LOCALE cookie (see
 * locales.ts), which is why the middleware must never write that cookie.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "as-needed",
  // No Accept-Language redirects: `/` is always Uzbek.
  localeDetection: false,
  // Same cookie name the portals use — leave it alone.
  localeCookie: false,
  // hreflang comes from each page's metadata instead.
  alternateLinks: false,
});

/** Public path of the landing page in a locale: "/", "/ru", "/en". */
export function landingPath(locale: string): string {
  return locale === DEFAULT_LOCALE ? "/" : `/${locale}`;
}
