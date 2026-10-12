"use client";

import { usePlatformBrandingQuery } from "@/lib/queries/settings";

/** Narrow single-column card for the secondary signed-out screens (forgot
 * password, forced password change) — same backdrop, border and shadow as
 * the login page's form card, without its brand panel. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const { data: branding } = usePlatformBrandingQuery();
  const platformName = branding?.platformName || "Mentorio";
  const logoUrl = branding?.logoUrl || "/logo-mentorio.png";

  return (
    <main className="relative isolate grid min-h-svh place-items-center overflow-hidden bg-[#f7f7fd] p-5 sm:p-9">
      <div className="pointer-events-none absolute -top-[170px] left-[10%] -z-10 h-[650px] w-[650px] rounded-full bg-[radial-gradient(circle,rgba(113,81,235,0.08),transparent_69%)]" />
      <div className="pointer-events-none absolute right-[5%] -bottom-[250px] -z-10 h-[720px] w-[720px] rounded-full bg-[radial-gradient(circle,rgba(49,153,238,0.07),transparent_68%)]" />

      <section className="w-full max-w-[520px] rounded-[20px] border border-[rgba(59,57,111,0.1)] bg-white px-6 pt-7 pb-8 shadow-[0_2px_8px_rgba(41,40,88,0.04),0_24px_70px_rgba(83,70,169,0.13)] sm:rounded-[22px] sm:px-11 sm:pt-9 sm:pb-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={platformName} className="mb-8 block h-auto max-h-12 w-[140px] object-contain object-left" />
        <header className="mb-7">
          <h1 className="text-[25px] leading-[1.2] font-bold tracking-[-0.04em] text-[#131626] sm:text-[28px]">{title}</h1>
          <p className="mt-2.5 text-sm leading-[1.6] text-[#77798a]">{subtitle}</p>
        </header>
        {children}
      </section>
    </main>
  );
}
