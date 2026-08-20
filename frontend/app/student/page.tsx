"use client";

import {
  CalendarCheck,
  GraduationCap,
  ClipboardList,
  BookOpenCheck,
  FileText,
  BarChart2,
  ClipboardCheck,
  MessageSquare,
  Clock,
  MapPin,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { useNotificationsQuery } from "@/lib/queries/notifications";
import { useExamsQuery } from "@/lib/queries/exams";
import { useAuthStore } from "@/lib/store/auth-store";
import { useLessonsQuery } from "@/lib/queries/schedule";
import type { Lesson } from "@/lib/api/schedule";
import { useStudentsQuery } from "@/lib/queries/students";
import { useStudentGroupMembershipsQuery } from "@/lib/queries/groups";
import { useAssignmentsQuery, useSubmissionsQuery } from "@/lib/queries/homework";
import { useAttendanceQuery } from "@/lib/queries/attendance";
import { useStudentGradeSummaryQuery } from "@/lib/queries/grades";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/i18n/locales";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalIso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(dateStr: string, locale: Locale) {
  const d = new Date(dateStr + "T00:00:00");
  return formatLocalizedDate(d, locale, { month: "short", day: "numeric", year: "numeric" });
}

// t is StudentDashboard's useTranslations return value. Real wall-clock
// "now" — Exams is wired to the real API, unlike the fixed TODAY anchor
// still used below for the still-mock welcome-banner date label.
function daysUntil(dateStr: string, t: ReturnType<typeof useTranslations<"StudentDashboard">>) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diff = Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return t("todayRelative");
  if (diff === 1) return t("tomorrowRelative");
  return t("inDaysRelative", { count: diff });
}

function formatRelativeTime(isoString: string, t: ReturnType<typeof useTranslations<"StudentDashboard">>) {
  // Real wall-clock "now" — this now also formats real Notification
  // timestamps (see the Recent Activity card below), which aren't anchored
  // to the dashboard's fixed demo date the way STUDENT_* mock data still is.
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return t("minutesAgo", { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t("hoursAgo", { count: diffH });
  return t("daysAgo", { count: Math.floor(diffH / 24) });
}

// Keyed by the real Notification.type (info/success/warning/error) — same
// switch from the invented category taxonomy to the real field the Super-
// Admin Notifications page already made (see that page's own note).
const notifDotColor: Record<string, string> = {
  info: "bg-blue-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScheduleItem({ lesson }: { lesson: Lesson }) {
  return (
    <div
      className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0"
      style={{ borderLeft: `3px solid ${lesson.course_color || "#6366f1"}`, paddingLeft: "12px" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-800 truncate">
            {lesson.group_name}
          </span>
          <StatusBadge status={lesson.status} />
        </div>
        <p className="text-xs text-slate-500 mt-0.5 truncate">{lesson.topic}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {lesson.start_time.slice(0, 5)} – {lesson.end_time.slice(0, 5)} &middot; {lesson.room || "—"}
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentDashboardPage() {
  const t = useTranslations("StudentDashboard");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const HOMEWORK_STATUS_CONFIG: Record<string, { label: string; variant: "success" | "info" | "warning" | "danger" }> = {
    pending: { label: t("statusPending"), variant: "warning" },
    submitted: { label: t("statusSubmitted"), variant: "info" },
    graded: { label: t("statusGraded"), variant: "success" },
    late: { label: t("statusLate"), variant: "danger" },
  };

  const QUICK_ACTIONS = [
    {
      label: t("qaViewHomework"),
      icon: <FileText className="h-6 w-6 text-indigo-600" />,
      iconBg: "bg-indigo-50",
      href: "/student/homework",
    },
    {
      label: t("qaCheckGrades"),
      icon: <BarChart2 className="h-6 w-6 text-emerald-600" />,
      iconBg: "bg-emerald-50",
      href: "/student/grades",
    },
    {
      label: t("qaViewSchedule"),
      icon: <CalendarCheck className="h-6 w-6 text-blue-600" />,
      iconBg: "bg-blue-50",
      href: "/student/schedule",
    },
    {
      label: t("qaMyAttendance"),
      icon: <ClipboardCheck className="h-6 w-6 text-amber-600" />,
      iconBg: "bg-amber-50",
      href: "/student/attendance",
    },
    {
      label: t("qaMessages"),
      icon: <MessageSquare className="h-6 w-6 text-violet-600" />,
      iconBg: "bg-violet-50",
      href: "/student/messages",
    },
  ];

  const { data: notifications = [] } = useNotificationsQuery();
  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const todayIso = toLocalIso(new Date());
  const { data: lessons = [] } = useLessonsQuery({ organizationId: organizationId ?? "", dateFrom: todayIso });
  const todayClasses = lessons.filter((l) => l.date === todayIso);
  const upcomingLessons = lessons.filter((l) => l.date > todayIso).slice(0, 4);

  const authUserId = useAuthStore((s) => s.user?.id);
  const { data: students = [] } = useStudentsQuery({ organizationId: organizationId ?? "" });
  const myProfile = students.find((s) => s.user === authUserId);
  const { data: memberships = [] } = useStudentGroupMembershipsQuery(myProfile?.id ?? null);
  const activeMemberships = memberships.filter((m) => m.status === "active");
  const myGroupIds = new Set(activeMemberships.map((m) => m.group));
  const { data: assignments = [] } = useAssignmentsQuery({ organizationId: organizationId ?? "" });
  const myAssignments = assignments.filter((a) => myGroupIds.has(a.group));
  const { data: submissions = [] } = useSubmissionsQuery({ organizationId: organizationId ?? "", studentProfile: myProfile?.id });
  const submittedAssignmentIds = new Set(submissions.map((s) => s.assignment));
  const allPendingHomework = myAssignments.filter((a) => !submittedAssignmentIds.has(a.id));
  const pendingHomework = allPendingHomework.slice(0, 4);

  // Not filtered to the student's own groups — same "schedule metadata,
  // not personal data" convention as the lessons query above (also
  // unfiltered by group), see backend/exams/views.py::ExamViewSet.
  const { data: exams = [] } = useExamsQuery({ organizationId: organizationId ?? "" });
  const upcomingExams = exams
    .filter((e) => e.status === "scheduled")
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));

  // Same formulas as app/student/profile/page.tsx's identical stat cards —
  // present-only attendance rate, and grade average sourced from the real,
  // computed Grades module (see backend/grades/views.py).
  const { data: attendance } = useAttendanceQuery({ organizationId: organizationId ?? "", studentProfile: myProfile?.id });
  const attendanceRecords = attendance ?? [];
  const attendanceRate =
    attendanceRecords.length > 0
      ? Math.round((attendanceRecords.filter((r) => r.status === "present").length / attendanceRecords.length) * 100)
      : 0;
  const { data: gradeRows } = useStudentGradeSummaryQuery();
  const gradedRows = (gradeRows ?? []).filter((r) => r.final_grade !== null);
  const avgGrade =
    gradedRows.length > 0 ? Math.round(gradedRows.reduce((sum, r) => sum + (r.final_grade as number), 0) / gradedRows.length) : 0;

  const todayLabel = formatLocalizedDate(new Date(), locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* ── Welcome Banner ─────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              {t("welcomeBack", { name: (myProfile?.user_full_name ?? "").split(" ")[0] })}
            </h2>
            <p className="text-indigo-100 text-sm mt-1">{todayLabel}</p>
            <p className="text-white/90 mt-2 text-base font-medium">
              {t("classesTodayLine", { count: todayClasses.length })}
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-1 text-right">
            <div className="bg-white/20 rounded-xl px-4 py-2 text-sm font-medium backdrop-blur-sm">
              {t("avgGradeBadge", { value: avgGrade })}
            </div>
            <div className="bg-white/20 rounded-xl px-4 py-2 text-sm font-medium backdrop-blur-sm">
              {t("coursesEnrolledBadge", { count: activeMemberships.length })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats Row ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t("statAttendanceRate")}
          value={`${attendanceRate}%`}
          icon={<ClipboardCheck className="h-5 w-5 text-indigo-600" />}
          iconBg="bg-indigo-50"
        />
        <StatCard
          label={t("statAverageGrade")}
          value={`${avgGrade}%`}
          icon={<GraduationCap className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
        />
        <StatCard
          label={t("statPendingHomework")}
          value={allPendingHomework.length}
          icon={<ClipboardList className="h-5 w-5 text-amber-600" />}
          iconBg="bg-amber-50"
        />
        <StatCard
          label={t("statUpcomingExams")}
          value={upcomingExams.length}
          icon={<BookOpenCheck className="h-5 w-5 text-violet-600" />}
          iconBg="bg-violet-50"
        />
      </div>

      {/* ── Quick Actions ──────────────────────────────────────────────── */}
      <Card title={t("quickActionsTitle")}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <a
              key={action.label}
              href={action.href}
              className="flex flex-col items-center gap-3 p-4 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors border border-slate-100 hover:border-slate-200 hover:shadow-sm"
            >
              <div className={`p-3 rounded-xl ${action.iconBg}`}>{action.icon}</div>
              <span className="text-xs font-medium text-slate-700 text-center leading-tight">
                {action.label}
              </span>
            </a>
          ))}
        </div>
      </Card>

      {/* ── Today's Classes + Upcoming Lessons ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card
            title={t("todaysClassesTitle")}
            subtitle={t("sessionsOn", { count: todayClasses.length, date: formatDate(todayIso, locale) })}
          >
            {todayClasses.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">{t("noClassesToday")}</p>
            ) : (
              <div className="space-y-0">
                {todayClasses.map((lesson) => (
                  <ScheduleItem key={lesson.id} lesson={lesson} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card title={t("upcomingLessonsTitle")} subtitle={t("next4Sessions")}>
          {upcomingLessons.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">{t("noUpcomingLessons")}</p>
          ) : (
            <div className="space-y-0">
              {upcomingLessons.map((lesson) => (
                <ScheduleItem key={lesson.id} lesson={lesson} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Pending Homework ──────────────────────────────────────────── */}
      <Card title={t("pendingHomeworkTitle")} subtitle={t("itemsNeedAttention", { count: pendingHomework.length })}>
        {pendingHomework.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">{t("allCaughtUp")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pendingHomework.map((assignment) => {
              const isLate = assignment.due_date < todayIso;
              return (
                <div
                  key={assignment.id}
                  className="rounded-xl border border-slate-100 p-3 hover:border-indigo-100 hover:bg-indigo-50/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{assignment.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{assignment.group_name}</p>
                    </div>
                    <Badge
                      label={HOMEWORK_STATUS_CONFIG[isLate ? "late" : "pending"].label}
                      variant={HOMEWORK_STATUS_CONFIG[isLate ? "late" : "pending"].variant}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
                    <Clock className="h-3 w-3" />
                    {t("dueLabel", { date: formatDate(assignment.due_date, locale) })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Recent Activity + Exam Reminders ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card title={t("recentActivityTitle")} subtitle={t("latestNotifications")}>
            <div className="space-y-4">
              {notifications.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">{t("noRecentNotifications")}</p>
              )}
              {notifications.slice(0, 5).map((notif) => (
                <div key={notif.id} className="flex items-start gap-3">
                  <div className="mt-1.5 flex-shrink-0">
                    <span
                      className={`h-2.5 w-2.5 rounded-full inline-block ${notifDotColor[notif.type] ?? "bg-slate-400"}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800 truncate">{notif.title}</p>
                      <span className="text-xs text-slate-400 flex-shrink-0">
                        {formatRelativeTime(notif.created_at, t)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{notif.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card title={t("examRemindersTitle")} subtitle={t("upcomingCountLabel", { count: upcomingExams.length })}>
          <div className="space-y-3">
            {upcomingExams.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">{t("noUpcomingExams")}</p>
            ) : (
              upcomingExams.map((exam) => (
                <div
                  key={exam.id}
                  className="rounded-xl border border-slate-100 p-3 hover:border-indigo-100 hover:bg-indigo-50/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{exam.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{exam.group_name}</p>
                    </div>
                    <BookOpenCheck className="h-4 w-4 text-violet-500 flex-shrink-0 mt-0.5" />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {formatDate(exam.date, locale)} &middot; {exam.start_time.slice(0, 5)}
                    </span>
                    <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5">
                      {daysUntil(exam.date, t)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
