import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createNotification,
  deleteNotification,
  getMyTelegram,
  listNotifications,
  markNotificationRead,
  updateMyTelegram,
  type NotificationInput,
} from "@/lib/api/notifications";

export function useNotificationsQuery(params: { read?: boolean } = {}) {
  return useQuery({
    queryKey: ["notifications", params],
    queryFn: () => listNotifications(params),
  });
}

export function useCreateNotificationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NotificationInput) => createNotification(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, read }: { id: string; read?: boolean }) => markNotificationRead(id, read),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useDeleteNotificationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Refetches on window focus on purpose: connecting happens in the Telegram
 * app, so coming back to this tab is exactly when the status changes. */
export function useMyTelegramQuery() {
  return useQuery({
    queryKey: ["notifications", "telegram"],
    queryFn: getMyTelegram,
    refetchOnWindowFocus: true,
  });
}

export function useUpdateMyTelegramMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationsEnabled: boolean) => updateMyTelegram(notificationsEnabled),
    onSuccess: (data) => {
      queryClient.setQueryData(["notifications", "telegram"], data);
    },
  });
}
