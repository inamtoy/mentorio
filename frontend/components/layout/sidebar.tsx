"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  Users2,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  Award,
  CreditCard,
  Bell,
  Settings,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Labels are AdminNav translation keys, resolved at render time via t()
// (see app/teacher/layout.tsx for the identical pattern this mirrors).

const NAV_ITEMS = [
  {
    groupKey: "navGroupMain",
    items: [
      { href: "/", labelKey: "navDashboard", icon: LayoutDashboard },
    ],
  },
  {
    groupKey: "navGroupPeople",
    items: [
      { href: "/students", labelKey: "navStudents", icon: Users },
      { href: "/teachers", labelKey: "navTeachers", icon: GraduationCap },
    ],
  },
  {
    groupKey: "navGroupAcademics",
    items: [
      { href: "/courses", labelKey: "navCourses", icon: BookOpen },
      { href: "/groups", labelKey: "navGroups", icon: Users2 },
      { href: "/schedule", labelKey: "navSchedule", icon: Calendar },
      { href: "/attendance", labelKey: "navAttendance", icon: ClipboardCheck },
      { href: "/homework", labelKey: "navHomework", icon: ClipboardList },
      { href: "/exams", labelKey: "navExams", icon: Award },
    ],
  },
  {
    groupKey: "navGroupAdministration",
    items: [
      { href: "/finance", labelKey: "navFinance", icon: CreditCard },
      { href: "/notifications", labelKey: "navNotifications", icon: Bell },
      { href: "/settings", labelKey: "navSettings", icon: Settings },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("AdminNav");

  return (
    <>
      {/* Mobile backdrop — tapping it dismisses the drawer, same as tapping a nav link */}
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
      <div className="flex items-center h-16 px-4 border-b border-slate-100 gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- static local asset, matches the plain <img> convention already used for branding.logoUrl on the login page */}
        <img src="/logo.png" alt="Mentorio" className="flex-shrink-0 h-9 w-9 object-contain rounded-xl" />
        <span className={cn("text-lg font-bold text-slate-900 tracking-tight", collapsed && "lg:hidden")}>
          Mentorio
        </span>
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
        {NAV_ITEMS.map((group) => (
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
                  href === "/" ? pathname === "/" : pathname.startsWith(href);
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
                      <span className={cn(collapsed && "lg:hidden")}>{label}</span>
                      {isActive && (
                        <span className={cn("ml-auto h-1.5 w-1.5 rounded-full bg-indigo-500", collapsed && "lg:hidden")} />
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
