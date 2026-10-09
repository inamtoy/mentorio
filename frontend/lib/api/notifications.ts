import { apiFetch, fetchAllPages } from "@/lib/api/client";

export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  organization: string;
  recipient: string;
  sender: string | null;
  sender_name: string | null;
  title: string;
  message: string;
  type: NotificationType;
  category: string;
  read: boolean;
  read_at: string | null;
  created_at: string;
}

/**
 * Always the caller's own inbox — the backend scopes `NotificationViewSet`
 * to `recipient=request.user` unconditionally (see
 * backend/notifications/views.py), so there's no `organizationId`/
 * `recipient` param to pass here, unlike every other list* function in
 * `lib/api/*`. One person's inbox, not an org-wide log, so fetchAllPages'
 * "everything fits in a reasonable page-load" assumption holds even though
 * it technically grows without bound over the account's lifetime.
 */
export async function listNotifications(params: { read?: boolean } = {}): Promise<Notification[]> {
  const query = new URLSearchParams();
  if (params.read !== undefined) query.set("read", String(params.read));

  return fetchAllPages<Notification>("/api/v1/notifications/", query);
}

export interface NotificationInput {
  recipient: string;
  title: string;
  message: string;
  type?: NotificationType;
  category?: string;
}

export async function createNotification(input: NotificationInput): Promise<Notification> {
  return apiFetch<Notification>("/api/v1/notifications/", {
    method: "POST",
    body: JSON.stringify({
      recipient: input.recipient,
      title: input.title,
      message: input.message,
      type: input.type ?? "info",
      category: input.category ?? "",
    }),
  });
}

export async function markNotificationRead(id: string, read: boolean = true): Promise<Notification> {
  return apiFetch<Notification>(`/api/v1/notifications/${id}/`, {
    method: "PATCH",
    body: JSON.stringify({ read }),
  });
}

export async function deleteNotification(id: string): Promise<void> {
  await apiFetch(`/api/v1/notifications/${id}/`, { method: "DELETE" });
}

/** The caller's own Telegram link for notifications. Connecting happens in
 * the bot (open `bot_url`, share your number) — backend
 * notifications.views.MyTelegramView only reports and toggles it.
 * `bot_url` is null when the server has no bot configured. */
export interface MyTelegram {
  connected: boolean;
  username: string | null;
  notifications_enabled: boolean;
  bot_url: string | null;
}

export async function getMyTelegram(): Promise<MyTelegram> {
  return apiFetch<MyTelegram>("/api/v1/notifications/telegram/");
}

export async function updateMyTelegram(notificationsEnabled: boolean): Promise<MyTelegram> {
  return apiFetch<MyTelegram>("/api/v1/notifications/telegram/", {
    method: "PATCH",
    body: JSON.stringify({ notifications_enabled: notificationsEnabled }),
  });
}
