"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import { useResetUserPasswordMutation } from "@/lib/queries/users";
import { toast } from "@/lib/store/toast-store";

type Step = "idle" | "confirm" | "done";

/** Inline admin-side password reset for a student/teacher edit dialog — no
 * nested modal. The temporary password exists only in this component's
 * state: it's shown once, and closing the dialog discards it. */
export function ResetPasswordPanel({ userId }: { userId: string }) {
  const t = useTranslations("ResetPassword");
  const mutation = useResetUserPasswordMutation();
  const [step, setStep] = useState<Step>("idle");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleConfirm() {
    try {
      setTemporaryPassword(await mutation.mutateAsync(userId));
      setStep("done");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("failedToast"));
      setStep("idle");
    }
  }

  function handleCopy() {
    navigator.clipboard
      .writeText(temporaryPassword)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <KeyRound className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{t("title")}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            {step === "done" ? t("doneHint") : t("description")}
          </p>

          {step === "idle" && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setStep("confirm")}>
              {t("resetButton")}
            </Button>
          )}

          {step === "confirm" && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3">
              <p className="text-xs text-amber-800">{t("confirmText")}</p>
              <div className="mt-2.5 flex gap-2">
                <Button variant="danger" size="sm" onClick={handleConfirm} loading={mutation.isPending}>
                  {t("confirmButton")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setStep("idle")} disabled={mutation.isPending}>
                  {t("cancelButton")}
                </Button>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm text-slate-900 select-all">
                {temporaryPassword}
              </code>
              <Button variant="outline" size="sm" onClick={handleCopy} aria-label={t("copyButton")}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? t("copied") : t("copyButton")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
