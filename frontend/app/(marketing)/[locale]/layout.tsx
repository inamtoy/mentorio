import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LOCALE_LABELS, isLocale, type Locale } from "@/i18n/locales";
import { landingPath } from "@/i18n/routing";
import { SALES_TELEGRAM_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

// Switcher order: the market's main languages first.
const SWITCHER_LOCALES: Locale[] = ["uz", "ru", "en"];

// Public pages (landing for now), one URL per locale: "/" (uz, rewritten
// here as [locale]=uz by next-intl's middleware in proxy.ts), "/ru", "/en".
// Server-rendered so crawlers get the full text.
export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("Landing");
  const year = new Date().getFullYear();
  const home = landingPath(locale);

  return (
    <div className="min-h-svh bg-white text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href={home} className="flex shrink-0 items-center rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none">
            {/* eslint-disable-next-line @next/next/no-img-element -- same static logo the portals use */}
            <img src="/logo-mentorio.png" alt="Mentorio" className="h-8 w-auto" />
          </Link>
          <nav aria-label="Main" className="ml-6 hidden items-center gap-6 text-sm text-slate-600 md:flex">
            <a href="#features" className="hover:text-slate-900">{t("navFeatures")}</a>
            <a href="#roles" className="hover:text-slate-900">{t("navRoles")}</a>
            <a href="#pricing" className="hover:text-slate-900">{t("navPricing")}</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* Plain links, not the portals' cookie switcher: each language
                is its own URL, and the portals' NEXT_LOCALE cookie is left
                untouched. */}
            <nav aria-label="Language" className="flex items-center rounded-lg border border-slate-200 p-0.5 text-xs font-medium">
              {SWITCHER_LOCALES.map((code) => (
                <Link
                  key={code}
                  href={landingPath(code)}
                  hrefLang={code}
                  lang={code}
                  aria-current={code === locale ? "true" : undefined}
                  title={LOCALE_LABELS[code].label}
                  className={cn(
                    "rounded-md px-2 py-1 uppercase",
                    code === locale ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {code}
                </Link>
              ))}
            </nav>
            <Link
              href="/login"
              className="inline-flex h-9 items-center rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:px-4"
            >
              {t("login")}
            </Link>
            <a
              href={SALES_TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-9 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary-hover sm:inline-flex"
            >
              {t("requestDemo")}
            </a>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>{t("footerRights", { year })}</p>
          <div className="flex gap-5">
            <a href="#features" className="hover:text-slate-800">{t("navFeatures")}</a>
            <a href="#pricing" className="hover:text-slate-800">{t("navPricing")}</a>
            <Link href="/login" className="hover:text-slate-800">{t("login")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
