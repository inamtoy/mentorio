"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, ExternalLink, Loader2, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { ApiError } from "@/lib/api/client";
import { useMyTelegramQuery, useUpdateMyTelegramMutation } from "@/lib/queries/notifications";
import { toast } from "@/lib/store/toast-store";

/** Settings → Notifications on every portal. In-app notifications are always
 * on; Telegram is the one outside channel (v1). Connecting happens in the
 * bot — the user shares their own number there, which is what proves it —
 * so this card only opens the bot, shows the link, and toggles it. */
export function TelegramNotificationsCard() {
  const t = useTranslations("TelegramNotifications");
  const { data, isLoading, isError } = useMyTelegramQuery();
  const mutation = useUpdateMyTelegramMutation();
  const botUrl = data?.bot_url ?? null;

  async function handleToggle() {
    if (!data) return;
    try {
      await mutation.mutateAsync(!data.notifications_enabled);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("saveFailed"));
    }
  }

  return (
    <Card title={t("title")} subtitle={t("subtitle")}>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <Send className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900">{t("telegramLabel")}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{t("telegramDescription")}</p>

            {isLoading && <Loader2 className="mt-3 h-4 w-4 animate-spin text-slate-400" />}

            {isError && <p className="mt-3 text-xs text-red-600">{t("loadFailed")}</p>}

            {data && !data.connected && (
              <div className="mt-3">
                {botUrl ? (
                  <>
                    <Button size="sm" onClick={() => window.open(botUrl, "_blank", "noopener,noreferrer")}>
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t("connectButton")}
                    </Button>
                    <p className="mt-2 text-xs text-slate-400">{t("connectHint")}</p>
                  </>
                ) : (
                  <p className="text-xs text-amber-700">{t("botNotConfigured")}</p>
                )}
              </div>
            )}

            {data?.connected && (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-green-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {data.username ? t("connectedAs", { username: data.username }) : t("connected")}
              </p>
            )}
          </div>

          {data?.connected && (
            <ToggleSwitch
              enabled={data.notifications_enabled}
              onChange={handleToggle}
              disabled={mutation.isPending}
              label={t("telegramLabel")}
            />
          )}
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">{t("whatYouGet")}</div>
      </div>
    </Card>
  );
}
