import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import {
  Award,
  BarChart2,
  Building2,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  GraduationCap,
  Send,
  ShieldCheck,
  Users,
  Users2,
  Wallet,
  UserCog,
  BookOpenCheck,
  HeartHandshake,
  type LucideIcon,
} from "lucide-react";
import { SALES_TELEGRAM_URL, SITE_URL } from "@/lib/site";

// Every feature listed here exists in the product (see the Landing.features
// messages). No customer counts, testimonials or logos until there are real
// ones to show.
const FEATURES: { key: string; icon: LucideIcon }[] = [
  { key: "people", icon: Users },
  { key: "groups", icon: Users2 },
  { key: "schedule", icon: Calendar },
  { key: "attendance", icon: ClipboardCheck },
  { key: "homework", icon: ClipboardList },
  { key: "exams", icon: Award },
  { key: "finance", icon: Wallet },
  { key: "payments", icon: CreditCard },
  { key: "telegram", icon: Send },
  { key: "reports", icon: BarChart2 },
  { key: "branches", icon: Building2 },
  { key: "security", icon: ShieldCheck },
];

const ROLES: { key: string; icon: LucideIcon }[] = [
  { key: "admin", icon: UserCog },
  { key: "teacher", icon: GraduationCap },
  { key: "student", icon: BookOpenCheck },
  { key: "parent", icon: HeartHandshake },
];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Landing");
  const title = t("metaTitle");
  const description = t("metaDescription");
  return {
    title,
    description,
    alternates: { canonical: "/" },
    openGraph: { title, description, url: "/" },
    twitter: { title, description },
  };
}

export default async function LandingPage() {
  const t = await getTranslations("Landing");
  const locale = await getLocale();

  // Structured data: what the product is — no ratings, offers or reviews.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Mentorio",
    url: SITE_URL,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    description: t("metaDescription"),
    inLanguage: locale,
  };

  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify output of our own constant — no user input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-[#f7f7fd]">
        <div className="pointer-events-none absolute -top-40 left-[10%] -z-10 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.12),transparent_70%)]" />
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <p className="text-sm font-semibold text-primary">{t("heroEyebrow")}</p>
          <h1 className="mt-3 max-w-3xl text-4xl leading-[1.1] font-bold tracking-tight text-slate-900 sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">{t("heroSubtitle")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href={SALES_TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 font-medium text-primary-foreground shadow-sm hover:bg-primary-hover"
            >
              {t("requestDemo")}
            </a>
            <a
              href="#features"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-6 font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("heroSecondary")}
            </a>
          </div>
          <p className="mt-6 text-sm text-slate-500">{t("heroLanguages")}</p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-16 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">{t("featuresTitle")}</h2>
          <p className="mt-3 max-w-2xl text-slate-600">{t("featuresSubtitle")}</p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ key, icon: Icon }) => (
              <li key={key} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{t(`features.${key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(`features.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="scroll-mt-16 bg-slate-50 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">{t("rolesTitle")}</h2>
          <p className="mt-3 max-w-2xl text-slate-600">{t("rolesSubtitle")}</p>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map(({ key, icon: Icon }) => (
              <li key={key} className="rounded-2xl border border-slate-200 bg-white p-6">
                <Icon className="h-6 w-6 text-primary" aria-hidden />
                <h3 className="mt-4 font-semibold text-slate-900">{t(`roles.${key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(`roles.${key}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-16 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{t("pricingTitle")}</h2>
            <p className="mt-3 text-slate-600">{t("pricingBody")}</p>
            <a
              href={SALES_TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 font-medium text-primary-foreground shadow-sm hover:bg-primary-hover"
            >
              {t("pricingCta")}
            </a>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-4 pb-20 sm:px-6 sm:pb-24">
        <div className="mx-auto max-w-6xl rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground sm:px-12">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("ctaTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-primary-foreground/85">{t("ctaBody")}</p>
          <a
            href={SALES_TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-7 inline-flex h-11 items-center justify-center rounded-xl bg-white px-6 font-medium text-slate-900 hover:bg-slate-100"
          >
            {t("requestDemo")}
          </a>
        </div>
      </section>
    </>
  );
}
