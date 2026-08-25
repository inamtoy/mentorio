"use client";
import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { cn } from "@/lib/utils";
import { usePlatformBrandingQuery } from "@/lib/queries/settings";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Seeded from the platform's Theme > compactSidebar default (Super-Admin
  // Settings) — a real default, not a forced state: still just the
  // useState initializer, so a user's own expand/collapse click (onToggle
  // below) still works exactly as before. `data` is undefined until the
  // (already-cached, see usePlatformBrandingQuery's staleTime) branding
  // fetch resolves, so this only actually changes the initial render once
  // it has — no flash/relayout after mount either way, just a possibly-
  // already-cached default at first paint.
  const { data: branding } = usePlatformBrandingQuery();
  const [collapsed, setCollapsed] = useState(() => branding?.theme.compactSidebar ?? false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <Header sidebarCollapsed={collapsed} onMenuClick={() => setMobileOpen((o) => !o)} />
      <main
        className={cn(
          "pt-16 min-h-screen transition-all duration-300",
          collapsed ? "lg:pl-16" : "lg:pl-[260px]"
        )}
      >
        <div className="p-4 sm:p-6 max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
