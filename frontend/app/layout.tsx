import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { QueryProvider } from "./query-provider";

export const metadata: Metadata = {
  title: "Mentorio — Education Management System",
  description: "Modern education management platform for schools and learning centers",
  icons: { icon: "/logo.png" },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // getLocale()/getMessages() read the NEXT_LOCALE cookie (see
  // i18n/request.ts), which makes this shared, app-wide RootLayout depend
  // on cookies() and therefore opts every route — not just the Login +
  // Student portal this i18n pass targets — out of static rendering.
  // Accepted trade-off for now: every portal here is an authenticated
  // dashboard fetching per-user data client-side already (react-query),
  // so there was little to no static-optimization benefit to lose. If
  // that stops being true, scope the cookie read to just the routes that
  // need it instead of widening it here.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <QueryProvider>
            {children}
            <Toaster />
          </QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
