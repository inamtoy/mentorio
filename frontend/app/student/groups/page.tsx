'use client';

import { useMemo } from 'react';
import { Users, Clock, MapPin, Calendar, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { PageHeader } from '@/components/ui/page-header';
import { useAuthStore } from '@/lib/store/auth-store';
import { useGroupsQuery, useMyGroupMembershipsQuery } from '@/lib/queries/groups';
import type { DayOfWeek } from '@/lib/api/groups';
import { useCoursesQuery } from '@/lib/queries/courses';
import { useLessonsQuery } from '@/lib/queries/schedule';
import { ApiError } from '@/lib/api/client';
import { formatLocalizedDate } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/locales';
import { daysFromTodayIso } from '@/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string, locale: Locale) {
  const d = new Date(dateStr + 'T00:00:00');
  return formatLocalizedDate(d, locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface MyCourse {
  id: string;
  name: string;
  courseName: string;
  courseColor: string;
  teacherName: string;
  classmatesCount: number;
  nextLesson: string | null;
  days: DayOfWeek[];
  startTime: string | null;
  endTime: string | null;
  room: string | null;
}

// ─── Course Card ───────────────────────────────────────────────────────────────

function CourseCard({ course, locale }: { course: MyCourse; locale: Locale }) {
  const t = useTranslations('StudentGroups');
  return (
    <div
      className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col"
      style={{ borderTop: `4px solid ${course.courseColor}` }}
    >
      <div className="p-5 pb-0">
        <h3 className="text-base font-bold text-slate-900">{course.name}</h3>
        <p className="text-xs text-slate-500 mt-0.5">{course.courseName}</p>
        <p className="text-xs text-slate-400 mt-1">{t('taughtBy', { name: course.teacherName })}</p>
      </div>

      <div className="px-5 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {t('classmatesCount', { count: course.classmatesCount })}
          </span>
          <span className="text-xs text-slate-400">
            {t('nextLessonLabel')}{' '}
            <span className="font-medium text-slate-700">{course.nextLesson ? formatDate(course.nextLesson, locale) : '—'}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <Clock className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span>{course.days.join(', ') || '—'}</span>
          <span className="text-slate-300">·</span>
          <span>{course.startTime?.slice(0, 5) ?? '—'} – {course.endTime?.slice(0, 5) ?? '—'}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className="text-xs font-medium text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">
            {course.room || '—'}
          </span>
        </div>
      </div>

      <div className="p-5 pt-4 mt-auto flex gap-2">
        <a
          href="/student/schedule"
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors"
        >
          <Calendar className="h-3.5 w-3.5" />
          {t('scheduleAction')}
        </a>
        <a
          href="/student/homework"
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium transition-colors"
        >
          <FileText className="h-3.5 w-3.5" />
          {t('homeworkAction')}
        </a>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentGroupsPage() {
  const t = useTranslations('StudentGroups');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const organizationId = useAuthStore((s) => s.user?.organizationId);

  const {
    data: memberships,
    isLoading: membershipsLoading,
    isError,
    error,
  } = useMyGroupMembershipsQuery();
  const { data: groups, isLoading: groupsLoading } = useGroupsQuery({ organizationId: organizationId ?? '' });
  const { data: courses } = useCoursesQuery({ organizationId: organizationId ?? '' });
  // Lesson reads are unrestricted within the org (schedule metadata, not
  // personal data — see backend/schedule/views.py) — narrowed to "my
  // groups" below via the membership join, same as course/group joins on
  // this page. Cancelled lessons are excluded from "next lesson", matching
  // the Student Schedule page's own upcoming-lessons treatment.
  const todayIso = useMemo(() => daysFromTodayIso(0), []);
  const { data: lessons } = useLessonsQuery({ organizationId: organizationId ?? '', dateFrom: todayIso });

  const isLoading = membershipsLoading || groupsLoading;

  const myCourses: MyCourse[] = useMemo(() => {
    const groupById = new Map((groups ?? []).map((g) => [g.id, g]));
    const courseColorById = new Map((courses ?? []).map((c) => [c.id, c.color]));
    const nextLessonByGroup = new Map<string, string>();
    for (const lesson of lessons ?? []) {
      if (lesson.status === 'cancelled') continue;
      const existing = nextLessonByGroup.get(lesson.group);
      if (!existing || lesson.date < existing) nextLessonByGroup.set(lesson.group, lesson.date);
    }

    return (memberships ?? [])
      .filter((m) => m.status === 'active')
      .map((m) => {
        const group = groupById.get(m.group);
        if (!group) return null;
        return {
          id: group.id,
          name: group.name,
          courseName: group.course_name,
          courseColor: courseColorById.get(group.course) || '#6366f1',
          teacherName: group.teacher_name,
          // "Classmates" excludes the caller themselves.
          classmatesCount: Math.max(0, group.enrolled_count - 1),
          nextLesson: nextLessonByGroup.get(group.id) ?? null,
          days: group.days_of_week,
          startTime: group.start_time,
          endTime: group.end_time,
          room: group.room,
        };
      })
      .filter((c): c is MyCourse => c !== null);
  }, [memberships, groups, courses, lessons]);

  return (
    <div>
      <PageHeader title={t('pageTitle')} subtitle={t('enrolledCoursesSubtitle', { count: myCourses.length })} />

      {isError ? (
        <div className="flex items-center gap-2 py-12 text-sm text-red-500">
          <AlertCircle className="h-4 w-4" />
          {error instanceof ApiError ? error.message : t('loadErrorFallback')}
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loadingCourses')}
        </div>
      ) : myCourses.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-12">{t('noCoursesFound')}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {myCourses.map((course) => (
            <CourseCard key={course.id} course={course} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
