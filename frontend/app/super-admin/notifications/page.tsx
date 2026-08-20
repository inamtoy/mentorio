'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  CheckCheck,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { useNotificationsQuery, useMarkNotificationReadMutation } from '@/lib/queries/notifications';
import type { Notification, NotificationType } from '@/lib/api/notifications';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string, t: ReturnType<typeof useTranslations<'SuperAdminNotifications'>>) {
  const now = new Date();
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return t('minutesAgo', { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t('hoursAgo', { count: diffH });
  return t('daysAgo', { count: Math.floor(diffH / 24) });
}

// ─── Type Icon & Style ────────────────────────────────────────────────────────

function typeConfig(type: NotificationType) {
  return {
    success: { Icon: CheckCircle2, iconClass: 'text-emerald-600', bgClass: 'bg-emerald-50', borderClass: 'border-emerald-100' },
    warning: { Icon: AlertTriangle, iconClass: 'text-amber-600', bgClass: 'bg-amber-50', borderClass: 'border-amber-100' },
    error:   { Icon: XCircle,       iconClass: 'text-red-600',    bgClass: 'bg-red-50',    borderClass: 'border-red-100' },
    info:    { Icon: Info,           iconClass: 'text-blue-600',   bgClass: 'bg-blue-50',   borderClass: 'border-blue-100' },
  }[type];
}

// ─── Notification Row ─────────────────────────────────────────────────────────

function NotificationRow({ notif, onMarkRead }: { notif: Notification; onMarkRead: (id: string) => void }) {
  const t = useTranslations('SuperAdminNotifications');
  const cfg = typeConfig(notif.type);
  const { Icon, iconClass, bgClass, borderClass } = cfg;

  return (
    <div
      className={cn(
        'flex items-start gap-4 px-6 py-4 border-b border-slate-50 transition-colors',
        !notif.read ? 'bg-indigo-50/30' : 'bg-white',
        'hover:bg-slate-50/60'
      )}
    >
      {/* Icon */}
      <div className={`mt-0.5 flex-shrink-0 h-9 w-9 rounded-xl ${bgClass} border ${borderClass} flex items-center justify-center`}>
        <Icon className={`h-4 w-4 ${iconClass}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn('text-sm font-semibold', !notif.read ? 'text-slate-900' : 'text-slate-700')}>
            {notif.title}
          </p>
          {!notif.read && (
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
          )}
        </div>
        <p className="text-sm text-slate-500 mt-0.5 leading-snug">{notif.message}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-slate-400">{formatRelativeTime(notif.created_at, t)}</span>
        </div>
      </div>

      {/* Actions */}
      {!notif.read && (
        <button
          onClick={() => onMarkRead(notif.id)}
          className="flex-shrink-0 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors whitespace-nowrap"
          title={t('markAsReadTitle')}
        >
          {t('markReadButton')}
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const t = useTranslations('SuperAdminNotifications');
  const { data: notifications = [], isLoading, isError, error } = useNotificationsQuery();
  const markReadMutation = useMarkNotificationReadMutation();
  const [filterType, setFilterType] = useState<NotificationType | ''>('');
  const [filterRead, setFilterRead] = useState('');

  const unread = notifications.filter((n) => !n.read).length;

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      const matchType = !filterType || n.type === filterType;
      const matchRead =
        !filterRead ||
        (filterRead === 'unread' && !n.read) ||
        (filterRead === 'read' && n.read);
      return matchType && matchRead;
    });
  }, [notifications, filterType, filterRead]);

  const handleMarkRead = (id: string) => {
    markReadMutation.mutate({ id, read: true });
  };

  const handleMarkAllRead = () => {
    notifications.filter((n) => !n.read).forEach((n) => markReadMutation.mutate({ id: n.id, read: true }));
  };

  return (
    <div className="space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <PageHeader
        title={t('pageTitle')}
        subtitle={t('unreadCountLabel', { count: unread })}
        actions={
          unread > 0 ? (
            <Button variant="outline" onClick={handleMarkAllRead}>
              <CheckCheck className="h-4 w-4" />
              {t('markAllReadButton')}
            </Button>
          ) : null
        }
      />

      {/* ── Summary Cards — click a type to filter by it ─────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(
          [
            { type: 'info', label: t('typeInfo'), Icon: Info, color: 'text-blue-600', bg: 'bg-blue-50' },
            { type: 'success', label: t('typeSuccess'), Icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { type: 'warning', label: t('typeWarning'), Icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
            { type: 'error', label: t('typeError'), Icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
          ] as const
        ).map(({ type, label, Icon, color, bg }) => {
          const count = notifications.filter((n) => n.type === type).length;
          const unreadType = notifications.filter((n) => n.type === type && !n.read).length;
          return (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? '' : type)}
              className={cn(
                'bg-white rounded-2xl p-5 shadow-sm border text-left transition-all',
                filterType === type ? 'border-indigo-200 ring-2 ring-indigo-100' : 'border-slate-100 hover:border-slate-200'
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2.5 rounded-xl ${bg}`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                {unreadType > 0 && (
                  <span className="ml-auto h-5 min-w-5 px-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadType}
                  </span>
                )}
              </div>
              <p className="text-xl font-bold text-slate-900">{count}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </button>
          );
        })}
      </div>

      {/* ── Notifications List ─────────────────────────────────────────────────── */}
      <Card noPadding>
        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-50">
          <Bell className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">{t('allNotificationsTitle')}</span>
          <div className="flex items-center gap-2 ml-auto">
            <Select
              value={filterRead}
              onChange={(e) => setFilterRead(e.target.value)}
              options={[
                { value: '', label: t('filterAll') },
                { value: 'unread', label: t('filterUnread') },
                { value: 'read', label: t('filterRead') },
              ]}
            />
            {(filterType || filterRead) && (
              <button
                onClick={() => {
                  setFilterType('');
                  setFilterRead('');
                }}
                className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
              >
                <X className="h-3 w-3" /> {t('clearButton')}
              </button>
            )}
          </div>
          <span className="text-xs text-slate-400">{t('notificationsCountLabel', { count: filtered.length })}</span>
        </div>

        {isError ? (
          <div className="flex items-center gap-2 px-6 py-8 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {error instanceof ApiError ? error.message : t('loadErrorFallback')}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loadingLabel')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Bell className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">{t('noNotifications')}</p>
          </div>
        ) : (
          <div>
            {filtered.map((notif) => (
              <NotificationRow
                key={notif.id}
                notif={notif}
                onMarkRead={handleMarkRead}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
