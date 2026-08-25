'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Clock, MapPin, Plus } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLessonsQuery } from '@/lib/queries/schedule';
import type { Lesson } from '@/lib/api/schedule';
import { LessonDetailDialog } from './_components/lesson-detail-dialog';
import { LessonFormDialog } from './_components/lesson-form-dialog';
import { formatLocalizedDate, weekdayShort, formatDayHeader, formatWeekRange, formatClockTime } from '@/i18n/date-locale';
import { isLocale, DEFAULT_LOCALE } from '@/i18n/locales';
import { useMyRegionSettingsQuery } from '@/lib/queries/settings';

// ─── Constants ────────────────────────────────────────────────────────────────

const HOUR_START = 8;
const HOUR_END = 18;
const HOURS: string[] = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => {
  const h = HOUR_START + i;
  return `${String(h).padStart(2, '0')}:00`;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formats a Date as a YYYY-MM-DD string using its local calendar date (not
 * toISOString, which converts to UTC and shifts the date backward a day in
 * timezones ahead of UTC). */
function toLocalIso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Returns the Monday of the week containing a given date */
function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Build an array of 7 ISO date strings (Mon–Sun) for the week starting at monday */
function buildWeek(monday: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toLocalIso(d);
  });
}

/** Top offset and height (px) for a lesson block, 60px per hour */
function getLessonStyle(startTime: string, endTime: string): { top: string; height: string } {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMin = (sh - HOUR_START) * 60 + sm;
  const endMin = (eh - HOUR_START) * 60 + em;
  return {
    top: `${startMin}px`,
    height: `${Math.max(endMin - startMin, 40)}px`,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TeacherSchedulePage() {
  const t = useTranslations('TeacherSchedule');
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const STATUS_LABELS: Record<Lesson['status'], string> = {
    scheduled: t('statusScheduled'),
    completed: t('statusCompleted'),
    cancelled: t('statusCancelled'),
  };

  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const todayIso = useMemo(() => toLocalIso(new Date()), []);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const currentMonday = useMemo(() => {
    const base = getMondayOf(new Date());
    base.setDate(base.getDate() + weekOffset * 7);
    return base;
  }, [weekOffset]);

  const weekDates = useMemo(() => buildWeek(currentMonday), [currentMonday]);
  const weekRange = useMemo(() => formatWeekRange(weekDates, locale), [weekDates, locale]);

  const { data: weekLessons = [] } = useLessonsQuery({
    organizationId: organizationId ?? '',
    dateFrom: weekDates[0],
    dateTo: weekDates[6],
  });
  // Today's timetable + upcoming panels look 30 days ahead regardless of
  // which week is currently navigated to.
  const { data: horizonLessons = [] } = useLessonsQuery({
    organizationId: organizationId ?? '',
    dateFrom: todayIso,
  });

  const todayLessons = useMemo(
    () => horizonLessons.filter((l) => l.date === todayIso).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [horizonLessons, todayIso]
  );

  const upcomingLessons = useMemo(
    () =>
      horizonLessons
        .filter((l) => l.date > todayIso && l.status !== 'cancelled')
        .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.start_time.localeCompare(b.start_time)))
        .slice(0, 5),
    [horizonLessons, todayIso]
  );

  const statusVariant = (status: Lesson['status']) => {
    if (status === 'completed') return 'success' as const;
    if (status === 'cancelled') return 'secondary' as const;
    return 'info' as const;
  };

  const { data: region } = useMyRegionSettingsQuery();
  const todayLabel = formatLocalizedDate(new Date(), locale, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: region?.timezone,
  });

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('weekOfSubtitle', { range: weekRange })}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekOffset((o) => o - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant={weekOffset === 0 ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setWeekOffset(0)}
            >
              {t('todayButton')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekOffset((o) => o + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              {t('newLessonButton')}
            </Button>
          </div>
        }
      />

      {/* ── Weekly Calendar Grid ─────────────────────────────────────── */}
      <Card noPadding className="overflow-hidden">
        {/* Day headers */}
        <div
          className="grid border-b border-slate-100"
          style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}
        >
          <div className="border-r border-slate-100 p-3" />
          {weekDates.map((date) => {
            const isToday = date === todayIso;
            return (
              <div
                key={date}
                className={`p-3 text-center border-r border-slate-100 last:border-0 ${
                  isToday ? 'bg-indigo-50' : ''
                }`}
              >
                <p
                  className={`text-[10px] font-semibold uppercase tracking-wide ${
                    isToday ? 'text-indigo-600' : 'text-slate-400'
                  }`}
                >
                  {weekdayShort(date, locale)}
                </p>
                <p
                  className={`text-sm font-bold mt-0.5 ${
                    isToday ? 'text-indigo-700' : 'text-slate-800'
                  }`}
                >
                  {formatDayHeader(date, locale)}
                </p>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="overflow-x-auto">
          <div
            className="grid"
            style={{
              gridTemplateColumns: '60px repeat(7, 1fr)',
              minHeight: `${(HOUR_END - HOUR_START + 1) * 60}px`,
            }}
          >
            {/* Time labels column */}
            <div className="border-r border-slate-100">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="h-[60px] border-b border-slate-50 flex items-start justify-end pr-2 pt-1"
                >
                  <span className="text-[10px] text-slate-400">{h}</span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDates.map((date) => {
              const dayLessons = weekLessons.filter((l) => l.date === date);
              const isToday = date === todayIso;

              return (
                <div
                  key={date}
                  className={`relative border-r border-slate-100 last:border-0 ${
                    isToday ? 'bg-indigo-50/30' : ''
                  }`}
                >
                  {/* Hour grid lines */}
                  {HOURS.map((h) => (
                    <div key={h} className="h-[60px] border-b border-slate-50" />
                  ))}

                  {/* Lesson blocks */}
                  {dayLessons.map((lesson) => {
                    const style = getLessonStyle(lesson.start_time, lesson.end_time);
                    const isCancelled = lesson.status === 'cancelled';
                    const color = lesson.course_color || '#6366f1';
                    return (
                      <div
                        key={lesson.id}
                        onClick={() => setSelectedLesson(lesson)}
                        className={`absolute left-1 right-1 rounded-lg px-2 py-1 overflow-hidden cursor-pointer transition-opacity ${
                          isCancelled ? 'opacity-50' : 'hover:opacity-90'
                        }`}
                        style={{
                          top: style.top,
                          height: style.height,
                          backgroundColor: `${color}18`,
                          borderLeft: `3px solid ${color}`,
                        }}
                      >
                        <p
                          className="text-[11px] font-semibold truncate leading-tight"
                          style={{ color }}
                        >
                          {lesson.group_name}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate leading-tight mt-0.5">
                          {lesson.topic}
                        </p>
                        <p className="text-[10px] text-slate-400 leading-tight">
                          {lesson.start_time.slice(0, 5)}–{lesson.end_time.slice(0, 5)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* ── Group color legend ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4">
        {Array.from(new Map(weekLessons.map((l) => [l.group, l])).values()).map((l) => (
          <div key={l.group} className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: l.course_color || '#6366f1' }}
            />
            <span className="text-xs text-slate-600">{l.group_name}</span>
          </div>
        ))}
      </div>

      {/* ── Bottom: Today's Timetable + Upcoming ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Timetable */}
        <Card
          title={t('todaysTimetableTitle')}
          subtitle={t('todaysTimetableSubtitle', { date: todayLabel, count: todayLessons.length })}
        >
          {todayLessons.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">
              {t('noLessonsToday')}
            </p>
          ) : (
            <ol className="space-y-3">
              {todayLessons.map((lesson, i) => (
                <li
                  key={lesson.id}
                  onClick={() => setSelectedLesson(lesson)}
                  className="flex items-start gap-3 cursor-pointer hover:bg-slate-50 rounded-xl -mx-2 px-2 py-1 transition-colors"
                >
                  {/* Number */}
                  <span
                    className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: lesson.course_color || '#6366f1' }}
                  >
                    {i + 1}
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">
                        {lesson.group_name}
                      </span>
                      <Badge
                        label={STATUS_LABELS[lesson.status]}
                        variant={statusVariant(lesson.status)}
                      />
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{lesson.topic}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatClockTime(lesson.start_time, locale)} – {formatClockTime(lesson.end_time, locale)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {lesson.room || '—'}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Upcoming Lessons */}
        <Card
          title={t('upcomingLessonsTitle')}
          subtitle={t('next5LessonsSubtitle')}
        >
          {upcomingLessons.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">
              {t('noUpcomingLessonsFound')}
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingLessons.map((lesson) => (
                <div
                  key={lesson.id}
                  onClick={() => setSelectedLesson(lesson)}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  {/* Colored left accent */}
                  <div
                    className="h-10 w-1 rounded-full flex-shrink-0"
                    style={{ backgroundColor: lesson.course_color || '#6366f1' }}
                  />

                  {/* Date badge */}
                  <div
                    className="flex-shrink-0 text-center rounded-xl px-2.5 py-1.5 min-w-[48px]"
                    style={{
                      backgroundColor: `${lesson.course_color || '#6366f1'}15`,
                    }}
                  >
                    <p
                      className="text-[10px] font-semibold uppercase leading-none"
                      style={{ color: lesson.course_color || '#6366f1' }}
                    >
                      {formatLocalizedDate(new Date(lesson.date + 'T00:00:00'), locale, { month: 'short' })}
                    </p>
                    <p
                      className="text-base font-bold leading-tight"
                      style={{ color: lesson.course_color || '#6366f1' }}
                    >
                      {new Date(lesson.date + 'T00:00:00').getDate()}
                    </p>
                  </div>

                  {/* Lesson details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {lesson.group_name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{lesson.topic}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {lesson.start_time.slice(0, 5)}–{lesson.end_time.slice(0, 5)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {lesson.room || '—'}
                      </span>
                    </div>
                  </div>

                  {/* Day-of-week label */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-medium text-slate-600">
                      {weekdayShort(lesson.date, locale)}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{formatDayHeader(lesson.date, locale)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <LessonDetailDialog lesson={selectedLesson} onOpenChange={(open) => !open && setSelectedLesson(null)} />
      <LessonFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
