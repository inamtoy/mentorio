import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { MarketingShell } from "@/components/marketing/marketing-shell";

// Non-default locales only ("/ru", "/en"). Uzbek lives at "/"
// (app/(marketing)/page.tsx); "/uz" is redirected there by proxy.ts.
export default async function LocaleMarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale) || locale === DEFAULT_LOCALE) notFound();
  setRequestLocale(locale);
  return <MarketingShell locale={locale}>{children}</MarketingShell>;
}
