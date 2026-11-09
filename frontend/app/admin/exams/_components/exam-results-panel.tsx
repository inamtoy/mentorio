"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Calendar, CheckCircle2, Clock, Edit2, Loader2, MapPin, Timer, Trash2, X, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/store/auth-store";
import { useGroupMembersQuery } from "@/lib/queries/groups";
import { useExamResultsQuery, useSaveExamResultMutation, useUpdateExamMutation } from "@/lib/queries/exams";
import type { Exam } from "@/lib/api/exams";
import { ApiError } from "@/lib/api/client";
import { toast } from "@/lib/store/toast-store";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/i18n/locales";

function formatDate(dateStr: string, locale: Locale) {
  return formatLocalizedDate(new Date(dateStr + "T00:00:00"), locale, { month: "short", day: "numeric", year: "numeric" });
}

// A score input is "entered" based on the string being non-empty, not the
// parsed number being > 0 — Number('') === 0 is indistinguishable from a
// real score of 0 under a truthy check. Same helper as Teacher Exams'
// ResultsPanel (frontend/app/teacher/exams/page.tsx), duplicated rather than
// shared since the two panels otherwise diverge (this one adds Edit/Cancel/
// Delete actions a teacher never gets).
function hasEnteredValue(raw: string | undefined): boolean {
  return raw !== undefined && raw.trim() !== "";
}

interface ExamResultsPanelProps {
  exam: Exam;
  onClose: () => void;
  onEdit: (exam: Exam) => void;
  onDelete: (exam: Exam) => void;
}

export function ExamResultsPanel({ exam, onClose, onEdit, onDelete }: ExamResultsPanelProps) {
  const t = useTranslations("AdminExams");
  const tc = useTranslations("Common");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const organizationId = useAuthStore((s) => s.user?.organizationId) ?? "";

  const { data: members = [], isSuccess: membersLoaded } = useGroupMembersQuery(exam.group);
  const students = useMemo(() => members.filter((m) => m.status === "active"), [members]);
  const { data: examResults = [], isSuccess: resultsLoaded } = useExamResultsQuery({ organizationId, exam: exam.id });
  const resultByStudent = useMemo(() => new Map(examResults.map((r) => [r.student_profile, r])), [examResults]);
  const saveResult = useSaveExamResultMutation();
  const updateExam = useUpdateExamMutation();

  const [results, setResults] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Seed exactly once, gated on both queries resolving — see
  // zustand-persist-rehydration-timing / Teacher Exams' identical comment
  // for why a plain useState lazy initializer would only ever see the
  // still-empty [] defaults from the very first render.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !membersLoaded || !resultsLoaded) return;
    const init: Record<string, string> = {};
    students.forEach((s) => {
      const existing = resultByStudent.get(s.student_profile)?.score;
      init[s.student_profile] = existing != null ? String(existing) : "";
    });
    setResults(init);
    seededRef.current = true;
  }, [membersLoaded, resultsLoaded, students, resultByStudent]);

  const enteredEntries = Object.entries(results).filter(([, value]) => hasEnteredValue(value));
  const scores = enteredEntries.map(([, value]) => Number(value)).filter((v) => !isNaN(v));
  const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  function handleScore(studentProfileId: string, value: string) {
    setResults((prev) => ({ ...prev, [studentProfileId]: value }));
  }

  async function handleSaveResults() {
    // Promise.allSettled([]) resolves to [] with zero rejected entries, so
    // without this guard an empty save (nothing entered yet, or every input
    // cleared) would still hit the failed.length === 0 branch below and
    // toast a false "saved successfully" despite making no request at all.
    if (enteredEntries.length === 0) return;
    setSaving(true);
    try {
      const toSave = enteredEntries.filter(([, value]) => !isNaN(Number(value)));
      const outcomes = await Promise.allSettled(
        toSave.map(([studentProfileId, value]) =>
          saveResult.mutateAsync({
            organizationId,
            examId: exam.id,
            studentProfileId,
            existingResultId: resultByStudent.get(studentProfileId)?.id ?? null,
            score: Number(value),
          })
        )
      );
      const failed = outcomes.filter((o) => o.status === "rejected");
      if (failed.length === 0) {
        toast.success(t("resultsSavedToast"));
      } else if (failed.length < outcomes.length) {
        toast.error(t("resultsPartiallySavedToast", { failed: failed.length, total: outcomes.length }));
      } else {
        const firstError = (failed[0] as PromiseRejectedResult).reason;
        toast.error(firstError instanceof ApiError ? firstError.message : tc("somethingWentWrong"));
      }
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: "completed" | "cancelled") {
    try {
      await updateExam.mutateAsync({ id: exam.id, input: { status } });
      toast.success(status === "cancelled" ? t("examCancelledToast") : t("examMarkedCompletedToast"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Card className="mt-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">{exam.title}</h3>
            <StatusBadge status={exam.status} />
          </div>
          <p className="text-xs text-slate-400 mt-1">{exam.group_name}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pb-4 mb-4 border-b border-slate-100">
        <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-slate-400" />{formatDate(exam.date, locale)}</span>
        <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-400" />{exam.start_time.slice(0, 5)}</span>
        <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-400" />{exam.room || "—"}</span>
        <span className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 text-slate-400" />{t("durationMinutes", { count: exam.duration_minutes })}</span>
        {scores.length > 0 && (
          <span className="ml-auto text-sm font-semibold text-indigo-600">
            {t("currentAverageLabel")}: {avg}/{exam.max_score}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {exam.status === "scheduled" && (
          <>
            <Button variant="outline" size="sm" onClick={() => setStatus("completed")} loading={updateExam.isPending}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("markCompletedButton")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setStatus("cancelled")} loading={updateExam.isPending}>
              <XCircle className="h-3.5 w-3.5" />
              {t("cancelButton")}
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" onClick={() => onEdit(exam)}>
          <Edit2 className="h-3.5 w-3.5" />
          {t("editButton")}
        </Button>
        <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50 hover:text-red-600" onClick={() => onDelete(exam)}>
          <Trash2 className="h-3.5 w-3.5" />
          {t("deleteButton")}
        </Button>
      </div>

      {!membersLoaded || !resultsLoaded ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loadingResults")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-4">{t("colStudent")}</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-4">{t("colScore")}</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-4">{t("colGrade")}</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-slate-400 text-sm py-12">{t("noStudentsInGroup")}</td>
                </tr>
              )}
              {students.map((member) => {
                const raw = results[member.student_profile];
                const entered = hasEnteredValue(raw);
                const scoreVal = entered ? Number(raw) : NaN;
                const pct = entered && exam.max_score > 0 ? (scoreVal / exam.max_score) * 100 : 0;
                const letterGrade = !entered ? "—" : pct >= 90 ? "A" : pct >= 80 ? "B" : pct >= 70 ? "C" : pct >= 60 ? "D" : "F";

                return (
                  <tr key={member.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={member.student_name} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{member.student_name}</p>
                          <p className="text-xs text-slate-400">{member.student_login_id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={exam.max_score}
                          value={raw ?? ""}
                          onChange={(e) => handleScore(member.student_profile, e.target.value)}
                          placeholder="—"
                          className="w-20 h-8 rounded-lg border border-slate-200 px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <span className="text-xs text-slate-400">/ {exam.max_score}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`text-sm font-bold ${!entered ? "text-slate-300" : pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-red-500"}`}>
                        {letterGrade}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
        <span className="text-xs text-slate-400">{t("studentsScored", { scored: scores.length, total: students.length })}</span>
        <Button variant="primary" onClick={handleSaveResults} loading={saving} disabled={students.length === 0 || enteredEntries.length === 0}>
          {t("saveResultsButton")}
        </Button>
      </div>
    </Card>
  );
}
