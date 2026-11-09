import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { LandingContent, landingMetadata } from "@/components/marketing/landing-content";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || locale === DEFAULT_LOCALE) return {};
  return landingMetadata(locale);
}

export default async function LocaleLandingPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale) || locale === DEFAULT_LOCALE) notFound();
  setRequestLocale(locale);
  return <LandingContent locale={locale} />;
}
