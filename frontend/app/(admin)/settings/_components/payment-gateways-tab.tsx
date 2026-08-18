"use client";

import { useState } from "react";
import { Save, Trash2, CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuthStore } from "@/lib/store/auth-store";
import {
  useGatewayAccountsQuery,
  useCreateGatewayAccountMutation,
  useUpdateGatewayAccountMutation,
  useDeleteGatewayAccountMutation,
} from "@/lib/queries/payment-gateways";
import { ToggleSwitch } from "../page";
import { toast } from "@/lib/store/toast-store";
import { ApiError } from "@/lib/api/client";
import type { PaymentGatewayAccount, Provider } from "@/lib/api/payment-gateways";

// Payme/Click are provider brand names — not translated.
const PROVIDERS: { id: Provider; label: string; needsServiceId: boolean }[] = [
  { id: "payme", label: "Payme", needsServiceId: false },
  { id: "click", label: "Click", needsServiceId: true },
];

interface FormState {
  merchantId: string;
  serviceId: string;
  secretKey: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = { merchantId: "", serviceId: "", secretKey: "", isActive: true };

function ProviderCard({ provider, label, needsServiceId, account }: {
  provider: Provider;
  label: string;
  needsServiceId: boolean;
  account?: PaymentGatewayAccount;
}) {
  const t = useTranslations("AdminSettings");
  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const createMutation = useCreateGatewayAccountMutation();
  const updateMutation = useUpdateGatewayAccountMutation();
  const deleteMutation = useDeleteGatewayAccountMutation();

  const [form, setForm] = useState<FormState>(
    account
      ? { merchantId: account.merchant_id, serviceId: account.service_id ?? "", secretKey: "", isActive: account.is_active }
      : EMPTY_FORM
  );
  // Adjusted during render, not in an effect — React's own endorsed
  // pattern for "reset/re-sync state when a prop changes" (see "Storing
  // information from previous renders" in the React docs). A background
  // refetch of the shared gateway-accounts query (window refocus, or
  // invalidation from saving the sibling provider's card) can leave this
  // still-mounted card showing stale data otherwise; comparing against a
  // ref-tracked key and calling setState synchronously mid-render (rather
  // than post-commit via useEffect) avoids the extra render pass without
  // clobbering an in-progress edit of unrelated fields between real
  // account changes.
  const accountKey = `${account?.id ?? ""}:${account?.merchant_id ?? ""}:${account?.service_id ?? ""}:${account?.is_active ?? ""}`;
  const [syncedAccountKey, setSyncedAccountKey] = useState(accountKey);
  if (accountKey !== syncedAccountKey) {
    setSyncedAccountKey(accountKey);
    setForm(
      account
        ? { merchantId: account.merchant_id, serviceId: account.service_id ?? "", secretKey: "", isActive: account.is_active }
        : EMPTY_FORM
    );
  }
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const saving = createMutation.isPending || updateMutation.isPending;

  async function handleSave() {
    if (!organizationId) return;
    if (!form.merchantId.trim()) {
      toast.error(t("merchantIdRequired"));
      return;
    }
    if (needsServiceId && !form.serviceId.trim()) {
      toast.error(t("serviceIdRequiredForClick"));
      return;
    }
    if (!account && !form.secretKey.trim()) {
      toast.error(t("secretKeyRequired"));
      return;
    }

    try {
      if (account) {
        await updateMutation.mutateAsync({
          id: account.id,
          input: { merchantId: form.merchantId, serviceId: form.serviceId, secretKey: form.secretKey, isActive: form.isActive },
        });
      } else {
        await createMutation.mutateAsync({
          organizationId,
          provider,
          merchantId: form.merchantId,
          serviceId: form.serviceId,
          secretKey: form.secretKey,
          isActive: form.isActive,
        });
      }
      setForm((f) => ({ ...f, secretKey: "" }));
      toast.success(t("gatewaySettingsSaved", { provider: label }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Card title={label} subtitle={account ? (account.is_active ? t("gatewayActive") : t("gatewayDisabled")) : t("gatewayNotConfigured")}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("merchantIdLabel")}</label>
            <Input value={form.merchantId} onChange={(e) => setForm({ ...form, merchantId: e.target.value })} placeholder={t("merchantIdLabel")} />
          </div>
          {needsServiceId && (
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("serviceIdLabel")}</label>
              <Input value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })} placeholder={t("serviceIdLabel")} />
            </div>
          )}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700 block mb-1.5">{t("secretKeyLabel")}</label>
          <Input
            type="password"
            value={form.secretKey}
            onChange={(e) => setForm({ ...form, secretKey: e.target.value })}
            placeholder={account?.has_secret_key ? t("secretKeyConfiguredPlaceholder") : t("secretKeyEnterPlaceholder")}
          />
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-slate-900">{t("acceptOnlinePaymentsLabel")}</p>
            <p className="text-xs text-slate-400">{t("acceptOnlinePaymentsDescription", { provider: label })}</p>
          </div>
          <ToggleSwitch enabled={form.isActive} onChange={() => setForm({ ...form, isActive: !form.isActive })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          {account && (
            <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
              <Trash2 className="h-4 w-4" />
              {t("removeButton")}
            </Button>
          )}
          <Button onClick={handleSave} loading={saving}>
            <Save className="h-4 w-4" />
            {t("saveButton")}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t("removeGatewayTitle", { provider: label })}
        description={t("removeGatewayDescription", { provider: label })}
        confirmLabel={t("removeButton")}
        onConfirm={async () => {
          if (!account) return;
          try {
            await deleteMutation.mutateAsync(account.id);
            setForm(EMPTY_FORM);
            toast.success(t("gatewayRemovedToast", { provider: label }));
          } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t("genericError"));
          }
        }}
      />
    </Card>
  );
}

export function PaymentGatewaysTab() {
  const t = useTranslations("AdminSettings");
  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: accounts, isLoading } = useGatewayAccountsQuery(organizationId ?? "");

  if (isLoading) {
    return (
      <Card title={t("paymentGatewaysTitle")} subtitle={t("paymentGatewaysSubtitle")}>
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <CreditCard className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">{t("loadingLabel")}</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {PROVIDERS.map(({ id, label, needsServiceId }) => (
        <ProviderCard
          key={id}
          provider={id}
          label={label}
          needsServiceId={needsServiceId}
          account={accounts?.find((a) => a.provider === id)}
        />
      ))}
    </div>
  );
}
