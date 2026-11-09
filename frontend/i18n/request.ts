import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "./locales";

export default getRequestConfig(async ({ requestLocale }) => {
  // Public pages: the locale comes from the URL (next-intl's middleware in
  // proxy.ts, see routing.ts). Portals: no URL locale, so the NEXT_LOCALE
  // cookie decides, as before.
  const fromUrl = await requestLocale;
  let locale = isLocale(fromUrl) ? fromUrl : undefined;
  if (!locale) {
    const cookieValue = (await cookies()).get(LOCALE_COOKIE)?.value;
    locale = isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
