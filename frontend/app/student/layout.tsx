"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  LayoutDashboard,
  Layers,
  Calendar,
  FileText,
  BookOpen,
  BarChart2,
  ClipboardCheck,
  MessageSquare,
  Bell,
  CreditCard,
  UserCircle,
  Settings,
  ChevronLeft,
  Search,
  ChevronDown,
  LogOut,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { STUDENT_PROFILE } from "@/lib/student-data";
import { useNotificationsQuery } from "@/lib/queries/notifications";
import { useLogout } from "@/lib/hooks/use-logout";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";

// ─── Nav Config ───────────────────────────────────────────────────────────────
// Labels are StudentNav translation keys, resolved at render time via t().

const NAV_GROUPS = [
  {
    groupKey: "navGroupMain",
    items: [
      { href: "/student", labelKey: "navDashboard", icon: LayoutDashboard },
    ],
  },
  {
    groupKey: "navGroupLearning",
    items: [
      { href: "/student/groups", labelKey: "navMyCourses", icon: Layers },
      { href: "/student/schedule", labelKey: "navSchedule", icon: Calendar },
      { href: "/student/homework", labelKey: "navHomework", icon: FileText },
      { href: "/student/exams", labelKey: "navExams", icon: BookOpen },
    ],
  },
  {
    groupKey: "navGroupProgress",
    items: [
      { href: "/student/grades", labelKey: "navGrades", icon: BarChart2 },
      { href: "/student/attendance", labelKey: "navAttendance", icon: ClipboardCheck },
    ],
  },
  {
    groupKey: "navGroupBilling",
    items: [
      { href: "/student/payments", labelKey: "navPayments", icon: CreditCard },
    ],
  },
  {
    groupKey: "navGroupCommunication",
    items: [
      { href: "/student/messages", labelKey: "navMessages", icon: MessageSquare },
      { href: "/student/notifications", labelKey: "navNotifications", icon: Bell },
    ],
  },
  {
    groupKey: "navGroupAccount",
    items: [
      { href: "/student/profile", labelKey: "navProfile", icon: UserCircle },
      { href: "/student/settings", labelKey: "navSettings", icon: Settings },
    ],
  },
];

// ─── Page title map ───────────────────────────────────────────────────────────
// Maps pathname to a StudentNav translation key (falls back to portalFallbackTitle).

const PAGE_TITLE_KEYS: Record<string, string> = {
  "/student": "navDashboard",
  "/student/groups": "navMyCourses",
  "/student/schedule": "navSchedule",
  "/student/homework": "navHomework",
  "/student/exams": "navExams",
  "/student/grades": "navGrades",
  "/student/attendance": "navAttendance",
  "/student/payments": "navPayments",
  "/student/messages": "navMessages",
  "/student/notifications": "navNotifications",
  "/student/profile": "navProfile",
  "/student/settings": "navSettings",
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function StudentSidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("StudentNav");

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "fixed left-0 top-0 h-full w-[260px] bg-white border-r border-slate-100 z-40 flex flex-col transition-all duration-300",
          "lg:z-30",
          collapsed ? "lg:w-16" : "lg:w-[260px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-slate-100 gap-3 flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- static local asset, matches the plain <img> convention already used for branding.logoUrl on the login page */}
        <img src="/logo.png" alt="Mentorio" className="flex-shrink-0 h-9 w-9 object-contain rounded-xl" />
        <div className={cn("flex items-center gap-2 min-w-0", collapsed && "lg:hidden")}>
          <span className="text-lg font-bold text-slate-900 tracking-tight">
            Mentorio
          </span>
          <span className="text-[11px] font-semibold bg-indigo-100 text-indigo-700 rounded-md px-1.5 py-0.5 leading-none flex-shrink-0">
            Student
          </span>
        </div>
        <button
          onClick={onToggle}
          className={cn(
            "ml-auto flex-shrink-0 h-7 w-7 rounded-lg hidden lg:flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors",
            collapsed && "rotate-180"
          )}
          aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.groupKey}>
            <p
              className={cn(
                "text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5 px-2",
                collapsed && "lg:hidden"
              )}
            >
              {t(group.groupKey)}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(({ href, labelKey, icon: Icon }) => {
                const isActive =
                  href === "/student"
                    ? pathname === "/student"
                    : pathname.startsWith(href);
                const label = t(labelKey);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onMobileClose}
                      title={collapsed ? label : undefined}
                      className={cn(
                        "flex items-center gap-3 h-9 rounded-xl px-2.5 text-sm font-medium transition-all group",
                        isActive
                          ? "bg-indigo-50 text-indigo-700"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                        collapsed && "lg:justify-center"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-[18px] w-[18px] flex-shrink-0",
                          isActive
                            ? "text-indigo-600"
                            : "text-slate-400 group-hover:text-slate-700"
                        )}
                      />
                      <span className={cn("truncate", collapsed && "lg:hidden")}>{label}</span>
                      {isActive && (
                        <span className={cn("ml-auto h-1.5 w-1.5 rounded-full bg-indigo-500 flex-shrink-0", collapsed && "lg:hidden")} />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      </aside>
    </>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

interface HeaderProps {
  sidebarCollapsed: boolean;
  onMenuClick: () => void;
}

function StudentHeader({ sidebarCollapsed, onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("StudentNav");
  const titleKey = PAGE_TITLE_KEYS[pathname];
  const title = titleKey ? t(titleKey) : t("portalFallbackTitle");
  const { data: notifications = [] } = useNotificationsQuery();
  const unreadCount = notifications.filter((n) => !n.read).length;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const handleLogout = useLogout();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-100 z-20 flex items-center gap-4 px-4 sm:px-6 transition-all duration-300",
        sidebarCollapsed ? "lg:left-16" : "lg:left-[260px]"
      )}
    >
      <button
        onClick={onMenuClick}
        aria-label={t("openMenuAriaLabel")}
        className="lg:hidden h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition-colors flex-shrink-0"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page title */}
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-slate-900 leading-none truncate">
          {title}
        </h2>
        <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">
          {formatLocalizedDate(new Date(), isLocale(locale) ? locale : DEFAULT_LOCALE, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div className="flex-1" />

      {/* Search */}
      <div className="relative hidden md:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder={t("quickSearchPlaceholder")}
          className="h-9 w-60 pl-9 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
        />
      </div>

      {/* Notifications */}
      <Link
        href="/student/notifications"
        className="relative h-9 w-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"
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
          className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-slate-100 transition-colors"
          aria-expanded={dropdownOpen}
          aria-haspopup="true"
        >
          <div className="h-8 w-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            AJ
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium text-slate-900 leading-none">
              {STUDENT_PROFILE.name}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{STUDENT_PROFILE.groupName}</p>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-slate-400 transition-transform hidden sm:block",
              dropdownOpen && "rotate-180"
            )}
          />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-lg border border-slate-100 py-1.5 z-50">
            <div className="px-4 py-2.5 border-b border-slate-50">
              <p className="text-sm font-semibold text-slate-900">
                {STUDENT_PROFILE.name}
              </p>
              <p className="text-xs text-slate-400">{STUDENT_PROFILE.loginId}</p>
            </div>
            <Link
              href="/student/profile"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <UserCircle className="h-4 w-4 text-slate-400" />
              {t("navProfile")}
            </Link>
            <Link
              href="/student/settings"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Settings className="h-4 w-4 text-slate-400" />
              {t("navSettings")}
            </Link>
            <div className="border-t border-slate-50 mt-1 pt-1">
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

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <StudentSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <StudentHeader sidebarCollapsed={collapsed} onMenuClick={() => setMobileOpen((o) => !o)} />
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
