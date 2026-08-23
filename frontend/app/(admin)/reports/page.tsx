"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, DollarSign, Wallet, AlertCircle, AlertTriangle, UserPlus, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Column } from "@/components/ui/data-table";
import {
  useAttendanceSummaryReportQuery,
  useFinanceSummaryReportQuery,
  useStudentsSummaryReportQuery,
  useTeachersSummaryReportQuery,
} from "@/lib/queries/reports";
import type { StudentReportRow, TeacherReportRow } from "@/lib/api/reports";
import { formatCurrency, daysFromTodayIso } from "@/lib/utils";
import { toast } from "@/lib/store/toast-store";

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Color-codes a %-rate cell the same way across both tables — green/amber/
 * red thresholds are presentational only, distinct from the backend's own
 * 70% at-risk threshold (AttendanceSummaryReportView.AT_RISK_THRESHOLD). */
function RatePill({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-400">—</span>;
  const color = value >= 85 ? "text-emerald-600" : value >= 70 ? "text-amber-600" : "text-red-500";
  return <span className={`font-medium ${color}`}>{value}%</span>;
}

export default function ReportsPage() {
  const t = useTranslations("AdminReports");

  // Real, always-applied date range — unlike the Super-Admin Reports page's
  // removed period selector (commit ca97963), every change here re-fires
  // all four queries with new start/end params the backend actually
  // filters on. Defaults to the 1st of the current month through today,
  // matching reports/views.py::_resolve_period's own default.
  const [start, setStart] = useState(() => monthStartIso());
  const [end, setEnd] = useState(() => daysFromTodayIso(0));
  const period = { start, end };

  const { data: studentsData, isLoading: studentsLoading } = useStudentsSummaryReportQuery(period);
  const students = studentsData ?? [];
  const { data: teachersData, isLoading: teachersLoading } = useTeachersSummaryReportQuery(period);
  const teachers = teachersData ?? [];
  const { data: attendance } = useAttendanceSummaryReportQuery(period);
  const { data: finance } = useFinanceSummaryReportQuery(period);

  const attendanceBreakdown = attendance
    ? [
        { key: "present", label: t("statusPresent"), value: attendance.present_count, color: "bg-emerald-500" },
        { key: "absent", label: t("statusAbsent"), value: attendance.absent_count, color: "bg-red-500" },
        { key: "late", label: t("statusLate"), value: attendance.late_count, color: "bg-amber-500" },
        { key: "excused", label: t("statusExcused"), value: attendance.excused_count, color: "bg-blue-500" },
        { key: "early_leave", label: t("statusEarlyLeave"), value: attendance.early_leave_count, color: "bg-violet-500" },
        { key: "sick", label: t("statusSick"), value: attendance.sick_count, color: "bg-slate-400" },
      ]
    : [];
  const attendanceTotal = attendanceBreakdown.reduce((sum, s) => sum + s.value, 0);

  function handleExport() {
    const rows = [
      [
        t("csvHeaderStudent"),
        t("csvHeaderCode"),
        t("csvHeaderAttendanceRate"),
        t("csvHeaderHomeworkCompletion"),
        t("csvHeaderAverageGrade"),
        t("csvHeaderExamAverage"),
      ],
      ...students.map((s) => [
        s.student_name,
        s.student_code,
        s.attendance_rate === null ? "" : String(s.attendance_rate),
        s.homework_completion_rate === null ? "" : String(s.homework_completion_rate),
        s.average_grade === null ? "" : String(s.average_grade),
        s.exam_average === null ? "" : String(s.exam_average),
      ]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `student-report-${start}-to-${end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t("reportExportedToast"));
  }

  const STUDENT_COLUMNS: Column<StudentReportRow>[] = [
    {
      key: "student_name",
      label: t("columnStudent"),
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.student_name} size="sm" />
          <div>
            <p className="font-medium text-slate-900">{row.student_name}</p>
            <p className="text-xs text-slate-400">{row.student_code}</p>
          </div>
        </div>
      ),
    },
    {
      key: "attendance_rate",
      label: t("columnAttendanceRate"),
      render: (val) => <RatePill value={val as number | null} />,
    },
    {
      key: "homework_completion_rate",
      label: t("columnHomeworkCompletion"),
      render: (val) => <RatePill value={val as number | null} />,
    },
    {
      key: "average_grade",
      label: t("columnAverageGrade"),
      render: (val) => <span className="font-medium text-slate-900">{val === null ? "—" : `${val}%`}</span>,
    },
    {
      key: "exam_average",
      label: t("columnExamAverage"),
      render: (val) => <span className="text-slate-600">{val === null ? "—" : `${val}%`}</span>,
    },
  ];

  const TEACHER_COLUMNS: Column<TeacherReportRow>[] = [
    {
      key: "teacher_name",
      label: t("columnTeacher"),
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.teacher_name} size="sm" />
          <div>
            <p className="font-medium text-slate-900">{row.teacher_name}</p>
            <p className="text-xs text-slate-400">{row.teacher_code}</p>
          </div>
        </div>
      ),
    },
    { key: "groups_count", label: t("columnGroups") },
    { key: "lessons_taught", label: t("columnLessonsTaught") },
    { key: "lessons_cancelled", label: t("columnLessonsCancelled") },
    { key: "total_students", label: t("columnStudentsCount") },
    {
      key: "average_attendance_rate",
      label: t("columnAvgAttendance"),
      render: (val) => <RatePill value={val as number | null} />,
    },
    {
      key: "average_student_grade",
      label: t("columnAvgGrade"),
      render: (val) => <span className="text-slate-600">{val === null ? "—" : `${val}%`}</span>,
    },
    { key: "homework_assigned", label: t("columnHomeworkAssigned") },
    { key: "homework_graded", label: t("columnHomeworkGraded") },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        subtitle={t("pageSubtitle")}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-36" aria-label={t("periodStartLabel")} />
            <span className="text-sm text-slate-400">{t("periodToLabel")}</span>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-36" aria-label={t("periodEndLabel")} />
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4" />
              {t("exportReportButton")}
            </Button>
          </div>
        }
      />

      {/* 3-per-row (not 6) — 6 stat cards on one row left "Total Invoiced"/
          "New Enrollments" truncated at typical widths (StatCard's label
          is `truncate`); 2 rows of 3 gives each card enough width. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label={t("statTotalInvoiced")} value={formatCurrency(finance?.total_invoiced ?? 0)} icon={<DollarSign className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t("statTotalCollected")} value={formatCurrency(finance?.total_collected ?? 0)} icon={<Wallet className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t("statOutstanding")} value={formatCurrency(finance?.total_outstanding ?? 0)} icon={<AlertCircle className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
        <StatCard label={t("statOverdue")} value={formatCurrency(finance?.total_overdue ?? 0)} icon={<AlertTriangle className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" />
        <StatCard label={t("statNewEnrollments")} value={finance?.new_enrollments ?? 0} icon={<UserPlus className="h-5 w-5 text-violet-600" />} iconBg="bg-violet-50" />
        <StatCard
          label={t("statAvgAttendance")}
          value={attendance?.average_attendance_rate == null ? "—" : `${attendance.average_attendance_rate}%`}
          icon={<ClipboardCheck className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card
          className="xl:col-span-2"
          title={t("attendanceOverviewTitle")}
          subtitle={t("attendanceOverviewSubtitle", { lessons: attendance?.total_lessons ?? 0, students: attendance?.total_students ?? 0 })}
        >
          {attendanceTotal === 0 ? (
            <p className="text-sm text-slate-400">{t("noAttendanceData")}</p>
          ) : (
            <div className="space-y-3">
              {attendanceBreakdown.map((s) => (
                <div key={s.key} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{s.label}</span>
                    <span className="font-medium text-slate-900">{s.value}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${s.color}`}
                      style={{ width: `${(s.value / attendanceTotal) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={t("atRiskStudentsTitle")} subtitle={t("atRiskStudentsSubtitle")}>
          <div className="space-y-3">
            {(attendance?.at_risk_students.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-400">{t("noAtRiskStudents")}</p>
            ) : (
              attendance!.at_risk_students.map((s) => (
                <div key={s.student_profile} className="flex items-center gap-3">
                  <Avatar name={s.student_name} size="sm" />
                  <p className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate">{s.student_name}</p>
                  <Badge label={`${s.attendance_rate}%`} variant="danger" />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card
        noPadding
        title={t("studentPerformanceTitle")}
        subtitle={t("studentPerformanceSubtitle", { count: students.length })}
      >
        <DataTable
          columns={STUDENT_COLUMNS}
          data={students}
          keyField="id"
          emptyMessage={studentsLoading ? t("loadingLabel") : t("noStudentsFound")}
        />
      </Card>

      <Card
        noPadding
        title={t("teacherPerformanceTitle")}
        subtitle={t("teacherPerformanceSubtitle", { count: teachers.length })}
      >
        <DataTable
          columns={TEACHER_COLUMNS}
          data={teachers}
          keyField="id"
          emptyMessage={teachersLoading ? t("loadingLabel") : t("noTeachersFound")}
        />
      </Card>
    </div>
  );
}
