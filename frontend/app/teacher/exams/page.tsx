'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Input, Select } from '@/components/ui/input';
import { StatCard } from '@/components/ui/stat-card';
import { DetailDialog } from '@/components/ui/dialog';
import { useAuthStore } from '@/lib/store/auth-store';
import { useMyTeacherProfileQuery } from '@/lib/queries/teachers';
import { useGroupsQuery, useGroupMembersQuery } from '@/lib/queries/groups';
import {
  useExamsQuery,
  useCreateExamMutation,
  useUpdateExamMutation,
  useExamResultsQuery,
  useSaveExamResultMutation,
} from '@/lib/queries/exams';
import type { Exam } from '@/lib/api/exams';
import { ApiError } from '@/lib/api/client';
import { toast } from '@/lib/store/toast-store';
import { formatLocalizedDate } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales';
import {
  Plus,
  Calendar,
  Clock,
  MapPin,
  Timer,
  Users,
  ClipboardCheck,
  CheckCircle2,
  BarChart3,
  Edit2,
  Trash2,
} from 'lucide-react';

// ─── Helpers ───────────────────────────────────────────────────────────────────

// Real group ids are UUIDs, not the small mock-era set this palette used to
// key off directly — hash the id into a stable index instead, same pattern
// as app/student/homework/page.tsx's cardColor().
const GROUP_COLOR_PALETTE = ['#6366f1', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ec4899'];

function groupColor(groupId: string): string {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) hash = (hash + groupId.charCodeAt(i)) % GROUP_COLOR_PALETTE.length;
  return GROUP_COLOR_PALETTE[hash];
}

function formatDate(dateStr: string, locale: Locale) {
  return formatLocalizedDate(new Date(dateStr + 'T00:00:00'), locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

function scoreBarColor(avg: number, max: number) {
  const pct = max > 0 ? (avg / max) * 100 : 0;
  if (pct > 80) return 'bg-emerald-500';
  if (pct > 60) return 'bg-amber-400';
  return 'bg-red-500';
}

// A score input is "entered" based on the string being non-empty, not on
// the parsed number being > 0 — Number('') is 0, which is indistinguishable
// from a real score of 0 if truthiness/`> 0` is used to mean "has a value".
// Every score-presence check in this file goes through this helper so a
// genuine 0 is never treated as blank.
function hasEnteredValue(raw: string | undefined): boolean {
  return raw !== undefined && raw.trim() !== '';
}

// ─── Form ──────────────────────────────────────────────────────────────────────

interface FormValues {
  title: string;
  groupId: string;
  date: string;
  startTime: string;
  duration: string;
  room: string;
  maxScore: string;
}

const EMPTY_FORM: FormValues = {
  title: '',
  groupId: '',
  date: '',
  startTime: '',
  duration: '90',
  room: '',
  maxScore: '100',
};

// ─── Results Panel ─────────────────────────────────────────────────────────────

interface ResultsPanelProps {
  exam: Exam;
}

function ResultsPanel({ exam }: ResultsPanelProps) {
  const t = useTranslations('TeacherExams');
  const tc = useTranslations('Common');
  const organizationId = useAuthStore((s) => s.user?.organizationId) ?? '';
  const { data: members = [], isSuccess: membersLoaded } = useGroupMembersQuery(exam.group);
  const students = useMemo(() => members.filter((m) => m.status === 'active'), [members]);
  const { data: examResults = [], isSuccess: resultsLoaded } = useExamResultsQuery({ organizationId, exam: exam.id });
  const resultByStudent = useMemo(() => new Map(examResults.map((r) => [r.student_profile, r])), [examResults]);
  const saveResult = useSaveExamResultMutation();

  const [results, setResults] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Both queries resolve async — a plain useState(() => ...) lazy
  // initializer would only ever see the empty [] defaults from the very
  // first render and never re-run once real data arrives (same stale-seed
  // class of bug as project memory's zustand-persist-rehydration-timing
  // note). Seed exactly once, gated on both queries actually having
  // resolved, so a teacher reopening an already-graded exam sees the real
  // saved scores instead of blank inputs.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !membersLoaded || !resultsLoaded) return;
    const init: Record<string, string> = {};
    students.forEach((s) => {
      const existing = resultByStudent.get(s.student_profile)?.score;
      init[s.student_profile] = existing != null ? String(existing) : '';
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

  async function handleSave() {
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
      const failed = outcomes.filter((o) => o.status === 'rejected');
      if (failed.length === 0) {
        toast.success(t('resultsSavedToast'));
      } else if (failed.length < outcomes.length) {
        toast.error(t('resultsPartiallySavedToast', { failed: failed.length, total: outcomes.length }));
      } else {
        const firstError = (failed[0] as PromiseRejectedResult).reason;
        toast.error(firstError instanceof ApiError ? firstError.message : tc('somethingWentWrong'));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pr-8">
        <div>
          <h3 className="font-semibold text-slate-900">{exam.title}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('enterResultsSubtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {scores.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-slate-400">{t('currentAverageLabel')}</p>
              <p className="text-lg font-bold text-indigo-600">
                {avg}<span className="text-sm font-normal text-slate-400">/{exam.max_score}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-4">{t('colStudent')}</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-4">{t('colScore')}</th>
              <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-4">{t('colGrade')}</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-slate-400 text-sm py-12">{t('noStudentsInGroup')}</td>
              </tr>
            )}
            {students.map((member) => {
              const raw = results[member.student_profile];
              const entered = hasEnteredValue(raw);
              const scoreVal = entered ? Number(raw) : NaN;
              const pct = entered && exam.max_score > 0 ? (scoreVal / exam.max_score) * 100 : 0;
              const letterGrade = !entered ? '—' : pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';

              return (
                <tr key={member.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={member.student_name} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{member.student_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        max={exam.max_score}
                        value={raw ?? ''}
                        onChange={(e) => handleScore(member.student_profile, e.target.value)}
                        placeholder="—"
                        className="w-20 h-8 rounded-lg border border-slate-200 px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-xs text-slate-400">/ {exam.max_score}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`text-sm font-bold ${!entered ? 'text-slate-300' : pct >= 80 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-red-500'}`}>
                      {letterGrade}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
        <span className="text-xs text-slate-400">{t('studentsScored', { scored: scores.length, total: students.length })}</span>
        <Button variant="primary" onClick={handleSave} loading={saving}>
          {t('saveResultsButton')}
        </Button>
      </div>
    </div>
  );
}

// ─── Upcoming Exam Card ────────────────────────────────────────────────────────

function UpcomingExamCard({
  exam,
  totalStudents,
  onEdit,
  onCancel,
  onComplete,
}: {
  exam: Exam;
  totalStudents: number;
  onEdit: (exam: Exam) => void;
  onCancel: (exam: Exam) => void;
  onComplete: (exam: Exam) => void;
}) {
  const t = useTranslations('TeacherExams');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const colorClass = groupColor(exam.group);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col gap-3" style={{ borderLeft: `4px solid ${colorClass}` }}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-bold text-slate-900 text-sm leading-tight flex-1">{exam.title}</h4>
        <span
          className="text-xs font-medium px-2.5 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: `${colorClass}18`, color: colorClass }}
        >
          {exam.group_name}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-slate-400" />{formatDate(exam.date, locale)}</span>
        <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-400" />{exam.start_time.slice(0, 5)}</span>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-400" />{exam.room || '—'}</span>
        <span className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 text-slate-400" />{t('durationMinutes', { count: exam.duration_minutes })}</span>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Users className="h-3.5 w-3.5 text-slate-400" />
        <span>{t('totalStudents', { count: totalStudents })}</span>
        <span className="text-slate-300 mx-1">·</span>
        <span>{t('questionsCount', { count: exam.question_count })}</span>
        <span className="text-slate-300 mx-1">·</span>
        <span>{t('maxPtsLabel', { points: exam.max_score })}</span>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={() => onComplete(exam)}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t('markCompletedButton')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => onEdit(exam)}>
          <Edit2 className="h-3.5 w-3.5" />
          {t('editButton')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-red-500 hover:bg-red-50 hover:text-red-600"
          onClick={() => onCancel(exam)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('cancelButton')}
        </Button>
      </div>
    </div>
  );
}

// ─── Completed Exam Card ───────────────────────────────────────────────────────

function CompletedExamCard({
  exam,
  avgScore,
  hasResults,
  onEnterResults,
  isActive,
}: {
  exam: Exam;
  avgScore: number;
  hasResults: boolean;
  onEnterResults: (exam: Exam) => void;
  isActive: boolean;
}) {
  const t = useTranslations('TeacherExams');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const colorClass = groupColor(exam.group);
  const barColor = scoreBarColor(avgScore, exam.max_score);
  const pct = exam.max_score > 0 ? (avgScore / exam.max_score) * 100 : 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-bold text-slate-900 text-sm leading-tight flex-1">{exam.title}</h4>
        <span
          className="text-xs font-medium px-2.5 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: `${colorClass}18`, color: colorClass }}
        >
          {exam.group_name}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <Calendar className="h-3.5 w-3.5 text-slate-400" />
        {formatDate(exam.date, locale)}
      </div>

      {hasResults ? (
        <>
          <div className="flex items-end gap-1">
            <span className="text-3xl font-bold text-slate-900">{avgScore}</span>
            <span className="text-sm text-slate-400 mb-1">/ {exam.max_score}</span>
            <span className="ml-auto text-xs text-slate-400 mb-1">{Math.round(pct)}%</span>
          </div>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-400 italic">{t('resultsNotYetEntered')}</p>
      )}

      <div className="pt-1">
        <Button variant={isActive ? 'secondary' : 'outline'} size="sm" onClick={() => onEnterResults(exam)} className="w-full">
          {hasResults ? (
            <><BarChart3 className="h-3.5 w-3.5" />{isActive ? t('closeResultsButton') : t('viewResultsButton')}</>
          ) : (
            <><ClipboardCheck className="h-3.5 w-3.5" />{isActive ? t('closePanelButton') : t('enterResultsButton')}</>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ExamsPage() {
  const t = useTranslations('TeacherExams');
  const tc = useTranslations('Common');
  const organizationId = useAuthStore((s) => s.user?.organizationId) ?? '';
  const { data: myProfile } = useMyTeacherProfileQuery();
  const { data: groups = [] } = useGroupsQuery({ organizationId, teacher: myProfile?.id });
  const { data: exams = [] } = useExamsQuery({ organizationId });
  const { data: allResults = [] } = useExamResultsQuery({ organizationId });
  const createMutation = useCreateExamMutation();
  const updateMutation = useUpdateExamMutation();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [saving, setSaving] = useState(false);

  // A teacher's own groups scope which exams belong to them — reads are
  // unrestricted org-wide at the API level (schedule metadata, see
  // backend/exams/views.py), so this is a client-side narrowing to "my
  // exams" for the teacher's own management view. One Map built from
  // `groups` covers both lookups (membership + enrolled_count) instead of
  // two separate passes over the same array.
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const myExams = useMemo(() => exams.filter((e) => groupById.has(e.group)), [exams, groupById]);

  const avgScoreByExam = useMemo(() => {
    const map = new Map<string, number>();
    const byExam = new Map<string, number[]>();
    allResults.forEach((r) => {
      if (r.score == null) return;
      const list = byExam.get(r.exam) ?? [];
      list.push(r.score);
      byExam.set(r.exam, list);
    });
    byExam.forEach((scores, examId) => {
      map.set(examId, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length));
    });
    return map;
  }, [allResults]);

  const upcomingExams = myExams.filter((e) => e.status === 'scheduled');
  const completedExams = myExams.filter((e) => e.status === 'completed');

  const upcomingCount = upcomingExams.length;
  const completedCount = completedExams.length;
  const avgScoreAcrossCompleted = (() => {
    // .has(), not a truthy/`> 0` check on the value — a completed exam
    // where every student genuinely scored 0 has a real average of 0 and
    // must still count here, distinct from an exam nobody has graded yet.
    const withScores = completedExams.filter((e) => avgScoreByExam.has(e.id)).map((e) => avgScoreByExam.get(e.id) as number);
    if (withScores.length === 0) return 0;
    return Math.round(withScores.reduce((a, b) => a + b, 0) / withScores.length);
  })();

  function handleFormChange(field: keyof FormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmitForm() {
    if (!form.title || !form.groupId || !form.date || !form.startTime) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          input: {
            title: form.title,
            group: form.groupId,
            date: form.date,
            startTime: form.startTime,
            durationMinutes: Number(form.duration) || 90,
            room: form.room,
            maxScore: Number(form.maxScore) || 100,
          },
        });
        toast.success(t('examUpdatedToast'));
      } else {
        await createMutation.mutateAsync({
          organizationId,
          group: form.groupId,
          title: form.title,
          date: form.date,
          startTime: form.startTime,
          durationMinutes: Number(form.duration) || 90,
          room: form.room,
          maxScore: Number(form.maxScore) || 100,
        });
        toast.success(t('examScheduledToast'));
      }
      setShowCreateForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(exam: Exam) {
    setEditingId(exam.id);
    setForm({
      title: exam.title,
      groupId: exam.group,
      date: exam.date,
      startTime: exam.start_time.slice(0, 5),
      duration: String(exam.duration_minutes),
      room: exam.room ?? '',
      maxScore: String(exam.max_score),
    });
    setShowCreateForm(true);
  }

  async function handleCancelExam(exam: Exam) {
    try {
      await updateMutation.mutateAsync({ id: exam.id, input: { status: 'cancelled' } });
      toast.success(t('examCancelledToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    }
  }

  async function handleCompleteExam(exam: Exam) {
    try {
      await updateMutation.mutateAsync({ id: exam.id, input: { status: 'completed' } });
      toast.success(t('examMarkedCompletedToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    }
  }

  function handleEnterResults(exam: Exam) {
    setActiveExam(exam);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setEditingId(null);
              setForm(EMPTY_FORM);
              setShowCreateForm((v) => !v);
              setActiveExam(null);
            }}
          >
            <Plus className="h-4 w-4" />
            {t('createExamButton')}
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t('statUpcomingExams')} value={upcomingCount} icon={<Calendar className="h-5 w-5 text-indigo-600" />} iconBg="bg-indigo-50" />
        <StatCard label={t('statCompletedExams')} value={completedCount} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t('statAverageScore')} value={avgScoreAcrossCompleted > 0 ? `${avgScoreAcrossCompleted}%` : '—'} icon={<BarChart3 className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
      </div>

      {showCreateForm && (
        <Card title={editingId ? t('editExamTitle') : t('scheduleNewExamTitle')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('fieldExamTitle')}</label>
              <Input placeholder={t('titlePlaceholder')} value={form.title} onChange={(e) => handleFormChange('title', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('fieldGroup')}</label>
              <Select
                value={form.groupId}
                onChange={(e) => handleFormChange('groupId', e.target.value)}
                placeholder={t('selectGroupPlaceholder')}
                className="w-full"
                options={groups.map((g) => ({ value: g.id, label: g.name }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('fieldDate')}</label>
              <Input type="date" value={form.date} onChange={(e) => handleFormChange('date', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('fieldStartTime')}</label>
              <Input type="time" value={form.startTime} onChange={(e) => handleFormChange('startTime', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('fieldDuration')}</label>
              <Input type="number" min={15} placeholder="90" value={form.duration} onChange={(e) => handleFormChange('duration', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('fieldRoom')}</label>
              <Input placeholder={t('roomPlaceholder')} value={form.room} onChange={(e) => handleFormChange('room', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">{t('fieldMaxScore')}</label>
              <Input type="number" min={1} placeholder="100" value={form.maxScore} onChange={(e) => handleFormChange('maxScore', e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateForm(false);
                setEditingId(null);
                setForm(EMPTY_FORM);
              }}
            >
              {t('cancelButton')}
            </Button>
            <Button variant="primary" onClick={handleSubmitForm} disabled={!form.title || !form.groupId || !form.date || !form.startTime} loading={saving}>
              <Calendar className="h-4 w-4" />
              {editingId ? t('saveChangesButton') : t('scheduleExamButton')}
            </Button>
          </div>
        </Card>
      )}

      <section>
        <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
          {t('upcomingExamsSection')}
          <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{upcomingCount}</span>
        </h2>

        {upcomingExams.length === 0 ? (
          <Card><div className="text-center py-10 text-slate-400 text-sm">{t('noUpcomingExamsScheduled')}</div></Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {upcomingExams.map((exam) => (
              <UpcomingExamCard
                key={exam.id}
                exam={exam}
                totalStudents={groupById.get(exam.group)?.enrolled_count ?? 0}
                onEdit={handleEdit}
                onCancel={handleCancelExam}
                onComplete={handleCompleteExam}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
          {t('completedExamsSection')}
          <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{completedCount}</span>
        </h2>

        {completedExams.length === 0 ? (
          <Card><div className="text-center py-10 text-slate-400 text-sm">{t('noCompletedExamsYet')}</div></Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {completedExams.map((exam) => (
              <div key={exam.id}>
                <CompletedExamCard
                  exam={exam}
                  avgScore={avgScoreByExam.get(exam.id) ?? 0}
                  hasResults={avgScoreByExam.has(exam.id)}
                  onEnterResults={handleEnterResults}
                  isActive={activeExam?.id === exam.id}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <DetailDialog open={!!activeExam} onClose={() => setActiveExam(null)} title={activeExam?.title ?? ''}>
        {activeExam && <ResultsPanel exam={activeExam} />}
      </DetailDialog>
    </div>
  );
}
