"use client";
import { useState } from "react";
import { Bell, Info, CheckCircle2, AlertTriangle, XCircle, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useNotificationsQuery, useMarkNotificationReadMutation } from "@/lib/queries/notifications";
import type { Notification, NotificationType } from "@/lib/api/notifications";
import { cn } from "@/lib/utils";

function NotificationIcon({ type }: { type: NotificationType }) {
  const map = {
    info: { icon: Info, color: "text-blue-500", bg: "bg-blue-50" },
    success: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50" },
    warning: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50" },
    error: { icon: XCircle, color: "text-red-500", bg: "bg-red-50" },
  };
  const { icon: Icon, color, bg } = map[type];
  return (
    <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0", bg)}>
      <Icon className={cn("h-5 w-5", color)} />
    </div>
  );
}

// t is AdminNotifications's useTranslations return value — see
// app/teacher/notifications/page.tsx's formatTime for the identical pattern.
function timeAgo(dateStr: string, t: ReturnType<typeof useTranslations<"AdminNotifications">>) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return t("minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });
  return t("daysAgo", { count: Math.floor(hours / 24) });
}

function NotificationItem({ notification, onRead }: { notification: Notification; onRead: (id: string) => void }) {
  const t = useTranslations("AdminNotifications");
  return (
    <div
      className={cn(
        "flex items-start gap-4 p-4 rounded-xl transition-colors",
        !notification.read ? "bg-indigo-50/50 hover:bg-indigo-50" : "hover:bg-slate-50"
      )}
    >
      <NotificationIcon type={notification.type} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm font-semibold", !notification.read ? "text-slate-900" : "text-slate-700")}>
            {notification.title}
            {!notification.read && <span className="ml-2 h-1.5 w-1.5 bg-indigo-500 rounded-full inline-block" />}
          </p>
          <span className="text-xs text-slate-400 flex-shrink-0">{timeAgo(notification.created_at, t)}</span>
        </div>
        <p className="text-sm text-slate-500 mt-0.5">{notification.message}</p>
      </div>
      {!notification.read && (
        <button
          onClick={() => onRead(notification.id)}
          className="flex-shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          title={t("markAsReadTitle")}
        >
          <Check className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  const t = useTranslations("AdminNotifications");

  // Single source of truth for the 4 real notification types — TYPE_OPTIONS
  // (the filter dropdown) and TYPE_LABELS (the stat cards below) both derive
  // from this instead of each hand-listing the same 4 entries separately.
  const NOTIFICATION_TYPES: { value: NotificationType; label: string }[] = [
    { value: "info", label: t("typeInfo") },
    { value: "success", label: t("typeSuccess") },
    { value: "warning", label: t("typeWarning") },
    { value: "error", label: t("typeError") },
  ];
  const TYPE_LABELS = Object.fromEntries(NOTIFICATION_TYPES.map((o) => [o.value, o.label])) as Record<NotificationType, string>;

  const TYPE_OPTIONS = [{ value: "", label: t("typeAll") }, ...NOTIFICATION_TYPES];

  const FILTER_OPTIONS = [
    { value: "", label: t("filterAll") },
    { value: "unread", label: t("filterUnread") },
    { value: "read", label: t("filterRead") },
  ];

  const { data: notifications = [], isLoading } = useNotificationsQuery();
  const markReadMutation = useMarkNotificationReadMutation();
  const [typeFilter, setTypeFilter] = useState("");
  const [readFilter, setReadFilter] = useState("");

  const markAsRead = (id: string) => {
    markReadMutation.mutate({ id, read: true });
  };

  const markAllRead = () => {
    notifications.filter((n) => !n.read).forEach((n) => markReadMutation.mutate({ id: n.id, read: true }));
  };

  const filtered = notifications.filter((n) => {
    const matchesType = !typeFilter || n.type === typeFilter;
    const matchesRead = !readFilter || (readFilter === "unread" ? !n.read : n.read);
    return matchesType && matchesRead;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const groups = {
    unread: filtered.filter((n) => !n.read),
    read: filtered.filter((n) => n.read),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        subtitle={isLoading ? t("loadingLabel") : t("unreadCountSubtitle", { count: unreadCount })}
        actions={
          <div className="flex items-center gap-2">
            <Select options={TYPE_OPTIONS} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-32" />
            <Select options={FILTER_OPTIONS} value={readFilter} onChange={(e) => setReadFilter(e.target.value)} className="w-28" />
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={markAllRead}>
                <Check className="h-4 w-4" />
                {t("markAllReadButton")}
              </Button>
            )}
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(["info", "success", "warning", "error"] as NotificationType[]).map((type) => {
          const count = notifications.filter((n) => n.type === type).length;
          const colors = {
            info: { bg: "bg-blue-50", text: "text-blue-700", icon: Info },
            success: { bg: "bg-emerald-50", text: "text-emerald-700", icon: CheckCircle2 },
            warning: { bg: "bg-amber-50", text: "text-amber-700", icon: AlertTriangle },
            error: { bg: "bg-red-50", text: "text-red-700", icon: XCircle },
          };
          const { bg, text, icon: Icon } = colors[type];
          return (
            <div key={type} className={cn("rounded-2xl p-4 flex items-center gap-3", bg)}>
              <Icon className={cn("h-6 w-6", text)} />
              <div>
                <p className={cn("text-xl font-bold", text)}>{count}</p>
                <p className={cn("text-xs font-medium", text)}>{TYPE_LABELS[type]}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Notifications list */}
      <Card title={t("allNotificationsTitle")} subtitle={t("notificationsCount", { count: filtered.length })}>
        {groups.unread.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{t("unreadGroupLabel")}</p>
            <div className="space-y-1">
              {groups.unread.map((n) => (
                <NotificationItem key={n.id} notification={n} onRead={markAsRead} />
              ))}
            </div>
          </div>
        )}

        {groups.read.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{t("earlierGroupLabel")}</p>
            <div className="space-y-1">
              {groups.read.map((n) => (
                <NotificationItem key={n.id} notification={n} onRead={markAsRead} />
              ))}
            </div>
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Bell className="h-12 w-12 mb-3 opacity-30" />
            <p>{t("noNotificationsFound")}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
