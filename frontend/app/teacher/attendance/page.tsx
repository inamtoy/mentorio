'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Clock, FileQuestion, Save } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Avatar } from '@/components/ui/avatar';
import { Input, Select } from '@/components/ui/input';
import { toast } from '@/lib/store/toast-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { useMyTeacherProfileQuery } from '@/lib/queries/teachers';
import { useGroupMembersQuery, useGroupsQuery } from '@/lib/queries/groups';
import {
  useAttendanceQuery,
  useCreateAttendanceMutation,
  useUpdateAttendanceMutation,
} from '@/lib/queries/attendance';
import { ApiError } from '@/lib/api/client';
import type { AttendanceStatus } from '@/lib/api/attendance';
import { formatLocalizedDate } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE } from '@/i18n/locales';

type MarkableStatus = 'present' | 'absent' | 'late' | 'excused';

// The Tashkent calendar day, matching the backend's "today" (settings.TIME_ZONE)
// rather than the browser's — a teacher may only mark this day, and the API
// enforces it (AttendanceViewSet._check_date_allowed). en-CA formats as YYYY-MM-DD.
function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
}

export default function TeacherAttendancePage() {
  const t = useTranslations('TeacherAttendance');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const STATUS_CONFIG: {
    value: MarkableStatus;
    label: string;
    activeBg: string;
    activeText: string;
    activeBorder: string;
    inactiveBg: string;
    inactiveText: string;
  }[] = useMemo(
    () => [
      { value: 'present', label: t('statusPresent'), activeBg: 'bg-emerald-500', activeText: 'text-white', activeBorder: 'border-emerald-500', inactiveBg: 'bg-white', inactiveText: 'text-emerald-600' },
      { value: 'absent', label: t('statusAbsent'), activeBg: 'bg-red-500', activeText: 'text-white', activeBorder: 'border-red-500', inactiveBg: 'bg-white', inactiveText: 'text-red-600' },
      { value: 'late', label: t('statusLate'), activeBg: 'bg-amber-500', activeText: 'text-white', activeBorder: 'border-amber-500', inactiveBg: 'bg-white', inactiveText: 'text-amber-600' },
      { value: 'excused', label: t('statusExcused'), activeBg: 'bg-blue-500', activeText: 'text-white', activeBorder: 'border-blue-500', inactiveBg: 'bg-white', inactiveText: 'text-blue-600' },
    ],
    [t],
  );

  function formatDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00');
    return formatLocalizedDate(d, locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: myProfile } = useMyTeacherProfileQuery();

  const { data: groups } = useGroupsQuery({ organizationId: organizationId ?? '', teacher: myProfile?.id });
  const [activeGroupId, setActiveGroupId] = useState<string>('');
  const today = todayIso();
  const [date, setDate] = useState(today);
  // Earlier days stay viewable as history, but only today can be marked.
  const isEditable = date === today;

  const activeGroup = (groups ?? []).find((g) => g.id === activeGroupId) ?? groups?.[0];
  const groupId = activeGroup?.id;

  const { data: members } = useGroupMembersQuery(groupId ?? null);
  const activeMembers = (members ?? []).filter((m) => m.status === 'active');

  // Existing records for this exact session (group + date) — used both to
  // pre-fill the editor and to decide create-vs-update per student on save.
  const { data: sessionRecords } = useAttendanceQuery({
    organizationId: organizationId ?? '',
    group: groupId,
    date,
  });

  // All records for this group (every date) — used for the per-student
  // attendance-rate panel, same derive-don't-store pattern as everywhere
  // else this session.
  const { data: groupRecords } = useAttendanceQuery({ organizationId: organizationId ?? '', group: groupId });

  const createMutation = useCreateAttendanceMutation();
  const updateMutation = useUpdateAttendanceMutation();

  const [draft, setDraft] = useState<Record<string, { status: MarkableStatus; notes: string }>>({});
  const [saving, setSaving] = useState(false);

  function statusFor(studentProfileId: string): MarkableStatus | null {
    if (draft[studentProfileId]) return draft[studentProfileId].status;
    const existing = sessionRecords?.find((r) => r.student_profile === studentProfileId);
    if (existing) return existing.status as MarkableStatus;
    // Defaulting to "present" only makes sense for a sheet being filled in;
    // on a read-only past day it would claim attendance nobody recorded.
    return isEditable ? 'present' : null;
  }

  function notesFor(studentProfileId: string): string {
    if (draft[studentProfileId]?.notes !== undefined) return draft[studentProfileId].notes;
    return sessionRecords?.find((r) => r.student_profile === studentProfileId)?.notes ?? '';
  }

  function setStatus(studentProfileId: string, status: MarkableStatus) {
    setDraft((d) => ({ ...d, [studentProfileId]: { status, notes: d[studentProfileId]?.notes ?? notesFor(studentProfileId) } }));
  }

  function setNotes(studentProfileId: string, notes: string) {
    setDraft((d) => ({ ...d, [studentProfileId]: { status: d[studentProfileId]?.status ?? statusFor(studentProfileId) ?? 'present', notes } }));
  }

  async function handleSave() {
    if (!organizationId || !groupId || !isEditable) return;
    setSaving(true);
    try {
      await Promise.all(
        activeMembers.map((m) => {
          const status = (statusFor(m.student_profile) ?? 'present') as AttendanceStatus;
          const notes = notesFor(m.student_profile);
          const existing = sessionRecords?.find((r) => r.student_profile === m.student_profile);
          if (existing) {
            return updateMutation.mutateAsync({ attendanceId: existing.id, input: { status, notes } });
          }
          return createMutation.mutateAsync({ organizationId, group: groupId, studentProfile: m.student_profile, date, status, notes });
        })
      );
      setDraft({});
      toast.success(t('attendanceSavedToast'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('saveFailedToast'));
    } finally {
      setSaving(false);
    }
  }

  const groupOptions = (groups ?? []).map((g) => ({ value: g.id, label: g.name }));

  const sessionSummary = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    activeMembers.forEach((m) => {
      const st = statusFor(m.student_profile);
      if (st) counts[st]++;
    });
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMembers, draft, sessionRecords]);

  const studentRates = useMemo(() => {
    return activeMembers
      .map((m) => {
        const records = (groupRecords ?? []).filter((r) => r.student_profile === m.student_profile);
        const present = records.filter((r) => r.status === 'present').length;
        const rate = records.length > 0 ? Math.round((present / records.length) * 100) : 0;
        return { id: m.student_profile, name: m.student_name, rate };
      })
      .sort((a, b) => a.rate - b.rate);
  }, [activeMembers, groupRecords]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('pageSubtitle')}
        actions={
          <div className="flex items-center gap-2">
            <Select
              options={groupOptions}
              value={groupId ?? ''}
              onChange={(e) => setActiveGroupId(e.target.value)}
              className="w-40"
            />
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setDraft({});
              }}
              className="w-40"
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t('statPresent')} value={sessionSummary.present} icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} iconBg="bg-emerald-50" />
        <StatCard label={t('statAbsent')} value={sessionSummary.absent} icon={<XCircle className="h-5 w-5 text-red-500" />} iconBg="bg-red-50" />
        <StatCard label={t('statLate')} value={sessionSummary.late} icon={<Clock className="h-5 w-5 text-amber-600" />} iconBg="bg-amber-50" />
        <StatCard label={t('statExcused')} value={sessionSummary.excused} icon={<FileQuestion className="h-5 w-5 text-blue-600" />} iconBg="bg-blue-50" />
      </div>

      {!groupId ? (
        <Card>
          <p className="text-sm text-slate-400 text-center py-8">{t('noGroupsAssigned')}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-0">
            <Card
              noPadding
              title={t('takeAttendanceTitle')}
              actions={
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400 hidden sm:block">{formatDate(date)}</span>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !isEditable || activeMembers.length === 0}
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? t('savingButton') : t('saveButton')}
                  </button>
                </div>
              }
            >
              {!isEditable && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5">
                  <p className="text-xs text-amber-700">{t('readOnlyPastDayHint')}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setDate(today);
                      setDraft({});
                    }}
                    className="text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-900"
                  >
                    {t('goToTodayButton')}
                  </button>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-4">{t('colStudent')}</th>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-4">{t('colStatus')}</th>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-4">{t('colNote')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeMembers.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-sm text-slate-400">{t('noStudentsInGroup')}</td>
                      </tr>
                    ) : (
                      activeMembers.map((m) => {
                        const currentStatus = statusFor(m.student_profile);
                        const currentNote = notesFor(m.student_profile);
                        return (
                          <tr key={m.id} className="border-b border-slate-50 last:border-0">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <Avatar name={m.student_name} size="sm" />
                                <span className="text-sm font-medium text-slate-900">{m.student_name}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {STATUS_CONFIG.map((cfg) => {
                                  const isActive = currentStatus === cfg.value;
                                  return (
                                    <button
                                      key={cfg.value}
                                      type="button"
                                      disabled={!isEditable}
                                      onClick={() => setStatus(m.student_profile, cfg.value)}
                                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                                        isActive
                                          ? `${cfg.activeBg} ${cfg.activeText} ${cfg.activeBorder}`
                                          : `${cfg.inactiveBg} ${cfg.inactiveText} border-slate-200 hover:border-current`
                                      }`}
                                    >
                                      {cfg.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <input
                                type="text"
                                value={currentNote}
                                onChange={(e) => setNotes(m.student_profile, e.target.value)}
                                disabled={!isEditable}
                                placeholder={isEditable ? t('notePlaceholder') : ''}
                                className="h-8 w-full max-w-[200px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition-all disabled:bg-slate-50 disabled:cursor-not-allowed"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card title={t('attendanceRatesTitle')} subtitle={t('studentsSubtitle', { name: activeGroup?.name ?? '' })}>
            {studentRates.length === 0 ? (
              <p className="text-sm text-slate-400">{t('noAttendanceHistory')}</p>
            ) : (
              <div className="space-y-4">
                {studentRates.map((s) => (
                  <div key={s.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-slate-700 truncate">{s.name}</span>
                      <span className={`text-sm font-bold ${s.rate < 70 ? 'text-red-500' : s.rate < 80 ? 'text-amber-500' : 'text-emerald-600'}`}>{s.rate}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${s.rate < 70 ? 'bg-red-400' : s.rate < 80 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${s.rate}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
