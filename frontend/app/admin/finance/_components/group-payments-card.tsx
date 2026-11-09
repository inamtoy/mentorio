"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, DollarSign } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Card } from "@/components/ui/card";
import { DetailDialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, SearchInput, Select } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { toast } from "@/lib/store/toast-store";
import { ApiError } from "@/lib/api/client";
import {
  useGroupBillingPageQuery,
  useGroupBillingQuery,
  useRecordGroupPaymentMutation,
} from "@/lib/queries/finance";
import { recordPaymentSchema, type RecordPaymentFormValues } from "@/lib/schemas/invoice-profile-schema";
import type { GroupBillingMember, GroupBillingSummary } from "@/lib/api/finance";
import { cn } from "@/lib/utils";
import { formatLocalizedDate } from "@/i18n/date-locale";
import { isLocale, DEFAULT_LOCALE } from "@/i18n/locales";
import { useFormatCurrency } from "@/i18n/format-currency";

// "YYYY-MM" — the shape GroupBillingViewSet takes its `period` in.
function toPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftPeriod(period: string, months: number): string {
  const [year, month] = period.split("-").map(Number);
  return toPeriod(new Date(year, month - 1 + months, 1));
}

function periodDate(period: string): Date {
  const [year, month] = period.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

/** The Admin Finance page's main view: every Group with how many of its
 * students paid the selected month. Clicking a Group opens its student list
 * in a DetailDialog, like every other admin list, where a payment is
 * recorded in place. No invoice has to be created by hand — recording a
 * payment raises the month's invoice if it's missing. */
export function GroupPaymentsCard({ viewSwitcher }: { viewSwitcher: React.ReactNode }) {
  const t = useTranslations("AdminFinance");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const [currentPeriod] = useState(() => toPeriod(new Date()));
  const [period, setPeriod] = useState(currentPeriod);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<GroupBillingSummary | null>(null);

  const { data, isLoading } = useGroupBillingPageQuery({ period, search: search.trim() || undefined, page });
  const groups = data?.results ?? [];

  function changePeriod(next: string) {
    setPeriod(next);
    setPage(1);
  }

  return (
    <Card
      noPadding
      title={t("groupPaymentsTitle")}
      subtitle={t("groupPaymentsCount", { count: data?.totalCount ?? 0 })}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {viewSwitcher}
          <div className="flex items-center rounded-lg border border-slate-200">
            <Button variant="ghost" size="icon" aria-label={t("previousMonth")} onClick={() => changePeriod(shiftPeriod(period, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-32 text-center text-sm font-medium text-slate-700 capitalize">
              {formatLocalizedDate(periodDate(period), locale, { month: "long", year: "numeric" })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("nextMonth")}
              disabled={period >= currentPeriod}
              onClick={() => changePeriod(shiftPeriod(period, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <SearchInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("searchGroupOrStudentPlaceholder")}
          />
        </div>
      }
    >
      {groups.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-slate-400">{isLoading ? t("loadingGroups") : t("noGroupsFound")}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {groups.map((group) => (
            <GroupRow key={group.id} group={group} onOpen={() => setSelected(group)} />
          ))}
        </div>
      )}
      {data && data.pageCount > 1 && (
        <div className="py-4 border-t border-slate-50">
          <Pagination page={page} pageCount={data.pageCount} onPageChange={setPage} />
        </div>
      )}

      <DetailDialog open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ""}>
        {selected && (
          <GroupMembersPanel
            group={selected}
            periodLabel={formatLocalizedDate(periodDate(period), locale, { month: "long", year: "numeric" })}
            period={period}
            search={search.trim()}
          />
        )}
      </DetailDialog>
    </Card>
  );
}

function GroupRow({ group, onOpen }: { group: GroupBillingSummary; onOpen: () => void }) {
  const t = useTranslations("AdminFinance");
  const formatMoney = useFormatCurrency();
  const paidShare = group.student_count > 0 ? (group.paid_count / group.student_count) * 100 : 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full px-6 py-3 text-left transition-colors hover:bg-slate-50 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1.3fr)_auto] md:items-center md:gap-4"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{group.name}</p>
        <p className="text-xs text-slate-400 truncate">
          {[group.course_name, group.teacher_name].filter(Boolean).join(" · ")}
        </p>
      </div>

      <GroupProgress group={group} paidShare={paidShare} />

      <div className="md:text-right">
        <p className="text-[13px] font-semibold">
          <span className="text-emerald-600">{formatMoney(Number(group.collected_amount))}</span>
          <span className="text-slate-400 font-normal"> / {formatMoney(Number(group.expected_amount))}</span>
        </p>
        <p className="text-xs text-slate-400">
          {group.monthly_price != null ? t("monthlyPrice", { price: formatMoney(Number(group.monthly_price)) }) : t("noPriceSet")}
        </p>
      </div>

      <ChevronRight className="hidden h-4 w-4 text-slate-300 md:block" />
    </button>
  );
}

function GroupProgress({ group, paidShare }: { group: GroupBillingSummary; paidShare: number }) {
  const t = useTranslations("AdminFinance");
  const owing = group.unpaid_count + group.partially_paid_count;
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-slate-700">
          {t("paidOfTotal", { paid: group.paid_count, total: group.student_count })}
        </span>
        {owing > 0 ? (
          <span className={group.overdue_count > 0 ? "font-medium text-red-500" : "text-amber-600"}>
            {group.overdue_count > 0 ? t("overdueCount", { count: group.overdue_count }) : t("unpaidCount", { count: owing })}
          </span>
        ) : (
          <span className="font-medium text-emerald-600">{t("allPaid")}</span>
        )}
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${paidShare}%` }} />
      </div>
    </div>
  );
}

function GroupMembersPanel({
  group,
  period,
  periodLabel,
  search,
}: {
  group: GroupBillingSummary;
  period: string;
  periodLabel: string;
  search: string;
}) {
  const t = useTranslations("AdminFinance");
  const formatMoney = useFormatCurrency();
  const { data, isLoading } = useGroupBillingQuery(group.id, period, true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const needle = search.toLowerCase();
  // The detail query refreshes after a payment; the list row it was opened
  // from is only the fallback while it loads.
  const summary = data ?? group;
  const paidShare = summary.student_count > 0 ? (summary.paid_count / summary.student_count) * 100 : 0;

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 px-6 py-5 pr-12 border-b border-slate-100 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.5fr)_auto] md:items-center">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{summary.name}</p>
          <p className="text-xs text-slate-500 truncate capitalize">
            {[periodLabel, summary.course_name, summary.teacher_name].filter(Boolean).join(" · ")}
          </p>
        </div>
        <GroupProgress group={summary} paidShare={paidShare} />
        <p className="text-sm font-semibold md:text-right">
          <span className="text-emerald-600">{formatMoney(Number(summary.collected_amount))}</span>
          <span className="text-slate-400 font-normal"> / {formatMoney(Number(summary.expected_amount))}</span>
        </p>
      </div>

      {isLoading || !data ? (
        <p className="px-6 py-6 text-sm text-slate-400">{t("loadingMembers")}</p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100 px-6 py-1">
          {data.members.map((member) => (
            <MemberRow
              key={member.student_profile}
              member={member}
              highlighted={needle !== "" && member.student_name.toLowerCase().includes(needle)}
              paying={payingId === member.student_profile}
              onPay={() => setPayingId(member.student_profile)}
              onClosePay={() => setPayingId(null)}
              groupId={group.id}
              groupName={group.name}
              period={period}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MemberRow({
  member,
  highlighted,
  paying,
  onPay,
  onClosePay,
  groupId,
  groupName,
  period,
}: {
  member: GroupBillingMember;
  highlighted: boolean;
  paying: boolean;
  onPay: () => void;
  onClosePay: () => void;
  groupId: string;
  groupName: string;
  period: string;
}) {
  const t = useTranslations("AdminFinance");
  const formatMoney = useFormatCurrency();
  const balance = member.balance != null ? Number(member.balance) : null;
  const canPay = balance != null && balance > 0;

  const STATUS: Record<GroupBillingMember["status"], { label: string; variant: "success" | "warning" | "danger" }> = {
    paid: { label: t("statusPaid"), variant: "success" },
    partially_paid: { label: t("statusPartiallyPaid"), variant: "warning" },
    unpaid: { label: t("statusUnpaid"), variant: "danger" },
  };
  const status = STATUS[member.status];

  return (
    <div className={cn("py-3", highlighted && "-mx-2 rounded-lg bg-amber-50 px-2")}>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={member.student_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{member.student_name}</p>
          <p className="truncate text-xs text-slate-400">
            {member.phone}
            {member.invoice_count === 0 && member.total_amount != null && ` · ${t("notInvoicedYet")}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-slate-900">
            {formatMoney(Number(member.paid_amount))}
            {member.total_amount != null && <span className="font-normal text-slate-400"> / {formatMoney(Number(member.total_amount))}</span>}
          </p>
          {balance != null && balance > 0 && (
            <p className="text-xs text-red-500">
              {t("columnBalance")}: {formatMoney(balance)}
            </p>
          )}
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          {member.is_overdue && <Badge label={t("statusOverdue")} variant="danger" />}
          <Badge label={status.label} variant={status.variant} dot />
          {canPay && !paying && (
            <Button size="sm" onClick={onPay}>
              <DollarSign className="h-3.5 w-3.5" />
              {t("addPaymentButton")}
            </Button>
          )}
        </div>
      </div>
      {paying && canPay && (
        <PaymentForm
          groupId={groupId}
          groupName={groupName}
          period={period}
          member={member}
          balance={balance}
          onClose={onClosePay}
        />
      )}
    </div>
  );
}

function PaymentForm({
  groupId,
  groupName,
  period,
  member,
  balance,
  onClose,
}: {
  groupId: string;
  groupName: string;
  period: string;
  member: GroupBillingMember;
  balance: number;
  onClose: () => void;
}) {
  const t = useTranslations("AdminFinance");
  const tc = useTranslations("Common");
  const mutation = useRecordGroupPaymentMutation();
  const [values, setValues] = useState<RecordPaymentFormValues>({ amount: balance, paymentMethod: "cash" });
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | undefined>();

  const PAYMENT_METHOD_OPTIONS = [
    { value: "cash", label: t("paymentMethodCash") },
    { value: "card", label: t("paymentMethodCard") },
    { value: "bank_transfer", label: t("paymentMethodBankTransfer") },
    { value: "online", label: t("paymentMethodOnline") },
    { value: "mobile_payment", label: t("paymentMethodMobilePayment") },
    { value: "other", label: t("paymentMethodOther") },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = recordPaymentSchema.safeParse(values);
    if (!result.success) {
      setError(result.error.issues[0]?.message);
      return;
    }
    try {
      await mutation.mutateAsync({
        groupId,
        studentProfile: member.student_profile,
        period,
        amount: result.data.amount,
        paymentMethod: result.data.paymentMethod,
        notes,
      });
      toast.success(t("paymentRecordedToast"));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-label={`${member.student_name} — ${groupName}`}
      className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto]"
    >
      <Input
        type="number"
        autoFocus
        aria-label={t("amountFieldPlaceholder")}
        placeholder={t("amountFieldPlaceholder")}
        value={values.amount}
        onChange={(e) => {
          setValues((v) => ({ ...v, amount: Number(e.target.value) }));
          setError(undefined);
        }}
        error={error}
      />
      <Select
        aria-label={t("paymentMethodLabel")}
        options={PAYMENT_METHOD_OPTIONS}
        value={values.paymentMethod}
        onChange={(e) => setValues((v) => ({ ...v, paymentMethod: e.target.value as RecordPaymentFormValues["paymentMethod"] }))}
      />
      <Input
        aria-label={t("paymentNotesPlaceholder")}
        placeholder={t("paymentNotesPlaceholder")}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={onClose} disabled={mutation.isPending}>
          {tc("cancel")}
        </Button>
        <Button type="submit" size="sm" className="h-9" loading={mutation.isPending}>
          {tc("save")}
        </Button>
      </div>
      <p className="text-xs text-slate-400 sm:col-span-4">{t("partialPaymentHint")}</p>
    </form>
  );
}
