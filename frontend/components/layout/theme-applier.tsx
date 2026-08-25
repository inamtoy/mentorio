"use client";

import { useEffect } from "react";
import { usePlatformBrandingQuery } from "@/lib/queries/settings";
import type { FontFamily } from "@/lib/api/settings";

// No next/font or any other webfont loader exists anywhere in this app
// today (see the plan doc this shipped against) — these are plain CSS
// font-stacks, not an actual @font-face load. Inter/Roboto/Outfit render
// using an OS-installed copy if the visitor happens to have one, falling
// back to the system stack otherwise; "system" is the app's original
// default stack unchanged.
const FONT_STACKS: Record<FontFamily, string> = {
  inter: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  roboto: 'Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  outfit: '"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

/** `--primary-hover` (Button's `primary` variant hover state) has no
 * separate admin-facing field — derived from `primaryColor` instead of
 * left at its default `#4f46e5`, which would otherwise mismatch any
 * non-indigo brand color on hover. ~15% darker per channel, clamped. */
function darken(hex: string, amount = 0.15): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return hex;
  const num = parseInt(match[1], 16);
  const channel = (shift: number) => Math.max(0, Math.round(((num >> shift) & 0xff) * (1 - amount)));
  return `#${[channel(16), channel(8), channel(0)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Mounted once in the root layout — applies Super-Admin Settings' Theme
 * panel to every portal's shell (not just Super-Admin's own screen),
 * including the pre-login page, via the same public PlatformBrandingView
 * the login page already reads. Deliberately scoped to a handful of CSS
 * custom properties consumed by the shared shell components (Card/Button/
 * Sidebar/Header — see their own comments) — most page content still
 * hardcodes its own Tailwind colors, so this is a real but bounded effect,
 * not a full app-wide repaint (see the plan doc this shipped against for
 * why). Renders nothing — a pure side-effect component.
 */
export function ThemeApplier() {
  const { data: branding } = usePlatformBrandingQuery();

  useEffect(() => {
    if (!branding) return;
    const root = document.documentElement;
    root.style.setProperty("--primary", branding.theme.primaryColor);
    root.style.setProperty("--primary-hover", darken(branding.theme.primaryColor));
    root.style.setProperty("--ring", branding.theme.primaryColor);
    root.style.setProperty("--font-sans", FONT_STACKS[branding.theme.fontFamily]);
    root.setAttribute("data-theme", branding.theme.darkMode ? "dark" : "light");
  }, [branding]);

  return null;
}
