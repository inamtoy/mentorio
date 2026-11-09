import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { SALES_TELEGRAM_URL } from "@/lib/site";

// Public pages (landing for now). Server-rendered so crawlers get the full
// text; only the language switcher runs on the client.
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Landing");
  const year = new Date().getFullYear();

  return (
    <div className="min-h-svh bg-white text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none">
            {/* eslint-disable-next-line @next/next/no-img-element -- same static logo the portals use */}
            <img src="/logo-mentorio.png" alt="Mentorio" className="h-8 w-auto" />
          </Link>
          <nav aria-label="Main" className="ml-6 hidden items-center gap-6 text-sm text-slate-600 md:flex">
            <a href="#features" className="hover:text-slate-900">{t("navFeatures")}</a>
            <a href="#roles" className="hover:text-slate-900">{t("navRoles")}</a>
            <a href="#pricing" className="hover:text-slate-900">{t("navPricing")}</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher />
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
