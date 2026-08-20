'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, GraduationCap, Trophy, BookOpen, AlertCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { useStudentGradeSummaryQuery } from '@/lib/queries/grades';
import { ApiError } from '@/lib/api/client';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentGradesPage() {
  const t = useTranslations('StudentGrades');
  const { data: rows, isLoading, isError, error } = useStudentGradeSummaryQuery();
  const list = rows ?? [];

  // Stats skip rows with no final_grade yet rather than letting them
  // poison the average/min/max as 0 — same reasoning as Teacher Grades.
  const graded = list.filter((g) => g.final_grade !== null);
  const overallAvg = graded.length > 0 ? Math.round(graded.reduce((s, g) => s + (g.final_grade as number), 0) / graded.length) : null;
  const topSubject = graded.length > 0 ? graded.reduce((best, g) => ((g.final_grade as number) > (best.final_grade as number) ? g : best)) : null;
  const needsAttention = graded.length > 0 ? graded.reduce((worst, g) => ((g.final_grade as number) < (worst.final_grade as number) ? g : worst)) : null;

  const assignmentLabel = t('colAssignment');
  const examLabel = t('colExam');
  const participationLabel = t('colParticipation');

  const barData = list.map((g) => ({
    name: g.subject,
    [assignmentLabel]: g.assignment_avg ?? 0,
    [examLabel]: g.exam_avg ?? 0,
    [participationLabel]: g.attendance_pct ?? 0,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')} />

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={t('statOverallAverage')}
          value={overallAvg !== null ? `${overallAvg}%` : '—'}
          icon={<GraduationCap className="h-5 w-5 text-indigo-600" />}
          iconBg="bg-indigo-50"
        />
        <StatCard
          label={t('statStrongestSubject')}
          value={topSubject?.subject ?? '—'}
          icon={<Trophy className="h-5 w-5 text-amber-600" />}
          iconBg="bg-amber-50"
        />
        <StatCard
          label={t('statNeedsAttention')}
          value={needsAttention?.subject ?? '—'}
          icon={<BookOpen className="h-5 w-5 text-red-500" />}
          iconBg="bg-red-50"
        />
      </div>

      {/* Subject Table */}
      <Card title={t('breakdownTitle')} subtitle={t('enrolledSubjectsSubtitle', { count: list.length })}>
        {isError ? (
          <div className="flex items-center gap-2 py-8 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error instanceof ApiError ? error.message : t('loadErrorFallback')}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loadingGrades')}
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">{t('noGradesFound')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colSubject')}</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colTeacher')}</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colAssignment')}</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colExam')}</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colParticipation')}</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colFinalGrade')}</th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide py-3 px-3">{t('colTrend')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((g) => (
                  <tr key={g.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-3">
                      <span className="text-sm font-semibold text-slate-900">{g.subject}</span>
                      <p className="text-xs text-slate-400">{g.group_name}</p>
                    </td>
                    <td className="py-3.5 px-3 text-sm text-slate-600">{g.teacher_name}</td>
                    <td className="py-3.5 px-3 text-sm text-slate-600">{g.assignment_avg ?? '—'}</td>
                    <td className="py-3.5 px-3 text-sm text-slate-600">{g.exam_avg ?? '—'}</td>
                    <td className="py-3.5 px-3 text-sm text-slate-600">{g.attendance_pct ?? '—'}</td>
                    <td className="py-3.5 px-3">
                      <span className="font-bold text-slate-900">{g.final_grade ?? '—'}</span>
                    </td>
                    <td className="py-3.5 px-3">
                      {g.trend === 'up' ? (
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                      ) : g.trend === 'down' ? (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      ) : (
                        <Minus className="h-4 w-4 text-slate-400" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Subject comparison bar chart */}
      {list.length > 0 && (
        <Card title={t('scoreComparisonTitle')} subtitle={t('scoreComparisonSubtitle')}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{ top: 4, right: 0, bottom: 0, left: -20 }} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', fontSize: '12px' }}
              />
              <Bar dataKey={assignmentLabel} fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey={examLabel} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              <Bar dataKey={participationLabel} fill="#a5b4fc" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 justify-center">
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 inline-block" /> {assignmentLabel}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-2.5 w-2.5 rounded-full bg-violet-500 inline-block" /> {examLabel}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-2.5 w-2.5 rounded-full bg-indigo-200 inline-block" /> {participationLabel}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
