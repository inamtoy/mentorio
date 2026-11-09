import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { LandingContent, landingMetadata } from "@/components/marketing/landing-content";
import { MarketingShell } from "@/components/marketing/marketing-shell";

// The default-locale (uz) landing page, served at "/" as a real route.
// Not a rewrite to /[locale]=uz: behind nginx (X-Forwarded-Proto: https)
// the standalone server turned that rewrite into an https proxy request to
// its own plain-http port and answered 500.
export function generateMetadata(): Promise<Metadata> {
  return landingMetadata(DEFAULT_LOCALE);
}

export default function HomePage() {
  setRequestLocale(DEFAULT_LOCALE);
  return (
    <MarketingShell locale={DEFAULT_LOCALE}>
      <LandingContent locale={DEFAULT_LOCALE} />
    </MarketingShell>
  );
}
