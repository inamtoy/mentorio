"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search, Menu, ChevronDown, Settings, LogOut, User } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
import { cn, getInitials } from "@/lib/utils";
import { useNotificationsQuery } from "@/lib/queries/notifications";
import { useAuthStore } from "@/lib/store/auth-store";
import { useLogout } from "@/lib/hooks/use-logout";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";
import { useMyRegionSettingsQuery } from "@/lib/queries/settings";

// Maps pathname to an AdminNav translation key (falls back to
// portalFallbackTitle) — see app/teacher/layout.tsx's PAGE_TITLE_KEYS.
const PAGE_TITLE_KEYS: Record<string, string> = {
  "/": "navDashboard",
  "/students": "navStudents",
  "/teachers": "navTeachers",
  "/courses": "navCourses",
  "/groups": "navGroups",
  "/schedule": "navSchedule",
  "/attendance": "navAttendance",
  "/homework": "navHomework",
  "/exams": "navExams",
  "/finance": "navFinance",
  "/reports": "navReports",
  "/notifications": "navNotifications",
  "/settings": "navSettings",
};

interface HeaderProps {
  onMenuClick?: () => void;
  sidebarCollapsed: boolean;
}

export function Header({ onMenuClick, sidebarCollapsed }: HeaderProps) {
  const pathname = usePathname();
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const t = useTranslations("AdminNav");
  const titleKey = PAGE_TITLE_KEYS[pathname];
  const title = titleKey ? t(titleKey) : t("portalFallbackTitle");
  const authUser = useAuthStore((s) => s.user);
  const { data: region } = useMyRegionSettingsQuery();
  const { data: notifications = [] } = useNotificationsQuery();
  const unreadCount = notifications.filter((n) => !n.read).length;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const handleLogout = useLogout();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 h-16 bg-card border-b border-border z-20 flex items-center gap-4 px-4 sm:px-6 transition-all duration-300",
        sidebarCollapsed ? "lg:left-16" : "lg:left-[260px]"
      )}
    >
      <button
        onClick={onMenuClick}
        aria-label={t("openMenuAriaLabel")}
        className="lg:hidden h-9 w-9 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-card-foreground leading-none truncate">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
          {formatLocalizedDate(new Date(), locale, { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: region?.timezone })}
        </p>
      </div>

      <div className="flex-1" />

      {/* Search */}
      <div className="relative hidden md:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={t("quickSearchPlaceholder")}
          className="h-9 w-60 pl-9 pr-4 rounded-xl border border-border bg-secondary text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:bg-card transition-all"
        />
      </div>

      {/* Notifications */}
      <Link
        href="/notifications"
        className="relative h-9 w-9 flex items-center justify-center rounded-xl hover:bg-secondary text-muted-foreground transition-colors"
        aria-label={t("notificationsAriaLabel", { count: unreadCount })}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-4 w-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </Link>

      {/* User dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-secondary transition-colors"
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
        >
          <div className="h-8 w-8 rounded-xl bg-accent flex items-center justify-center text-accent-foreground font-semibold text-sm flex-shrink-0">
            {getInitials(authUser?.fullName ?? t("roleAdmin"))}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium text-card-foreground leading-none">
              {authUser?.fullName ?? t("roleAdmin")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("roleAdmin")}</p>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform hidden sm:block", dropdownOpen && "rotate-180")} />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-2 w-52 bg-card rounded-2xl shadow-lg border border-border py-1.5 z-50">
            <div className="px-4 py-2.5 border-b border-border">
              <p className="text-sm font-semibold text-card-foreground">
                {authUser?.fullName ?? t("roleAdmin")}
              </p>
              <p className="text-xs text-muted-foreground">{authUser?.loginId}</p>
            </div>
            <Link
              href="/settings"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
            >
              <User className="h-4 w-4 text-muted-foreground" />
              {t("profileLabel")}
            </Link>
            <Link
              href="/settings"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              {t("navSettings")}
            </Link>
            <div className="border-t border-border mt-1 pt-1">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors w-full"
              >
                <LogOut className="h-4 w-4" />
                {t("signOut")}
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
