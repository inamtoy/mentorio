import { useCallback } from "react";
import { useLocale } from "next-intl";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/locales";
import { formatCurrency } from "@/lib/utils";

/** `formatCurrency` bound to the current UI language: "2 500 000 so'm" in
 * Uzbek, "2 500 000 сум" in Russian, "2,500,000 UZS" in English. */
export function useFormatCurrency() {
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  return useCallback((amount: number, currency?: string) => formatCurrency(amount, currency, locale), [locale]);
}
