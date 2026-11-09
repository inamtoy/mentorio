"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuthStore } from "@/lib/store/auth-store";
import { toast } from "@/lib/store/toast-store";
import { groupProfileSchema, type GroupProfileFormValues } from "@/lib/schemas/group-profile-schema";
import { useCreateGroupMutation, useUpdateGroupMutation } from "@/lib/queries/groups";
import { useCoursesQuery } from "@/lib/queries/courses";
import { useTeachersQuery } from "@/lib/queries/teachers";
import { ApiError } from "@/lib/api/client";
import type { Group, DayOfWeek } from "@/lib/api/groups";

const DAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const BILLING_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

const EMPTY_VALUES: GroupProfileFormValues = {
  name: "",
  course: "",
  teacher: "",
  room: "",
  daysOfWeek: [],
  startTime: "09:00",
  endTime: "10:30",
  maxStudents: 15,
  startDate: "",
  endDate: "",
  status: "forming",
  price: 0,
  billingDay: 1,
};

interface GroupFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: Group | null;
}

export function GroupFormDialog({ open, onOpenChange, group }: GroupFormDialogProps) {
  const t = useTranslations("AdminGroups");
  const mode = group ? "edit" : "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("formTitleNew") : t("formTitleEdit")}</DialogTitle>
        </DialogHeader>
        {open && <GroupFormFields key={group?.id ?? "new"} group={group} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function GroupFormFields({
  group,
  onOpenChange,
}: {
  group?: Group | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("AdminGroups");
  const tc = useTranslations("Common");
  const mode = group ? "edit" : "create";
  const organizationId = useAuthStore((s) => s.user?.organizationId);

  const STATUS_OPTIONS = [
    { value: "forming", label: t("statusForming") },
    { value: "active", label: t("statusActive") },
    { value: "completed", label: t("statusCompleted") },
    { value: "cancelled", label: t("statusCancelled") },
    { value: "archived", label: t("statusArchived") },
  ];

  const DAY_LABELS: Record<DayOfWeek, string> = {
    Mon: t("dayMon"), Tue: t("dayTue"), Wed: t("dayWed"), Thu: t("dayThu"),
    Fri: t("dayFri"), Sat: t("daySat"), Sun: t("daySun"),
  };

  const { data: courses } = useCoursesQuery({ organizationId: organizationId ?? "" });
  const { data: teachers } = useTeachersQuery({ organizationId: organizationId ?? "" });
  const createMutation = useCreateGroupMutation();
  const updateMutation = useUpdateGroupMutation();

  const [values, setValues] = useState<GroupProfileFormValues>(() =>
    group
      ? {
          name: group.name,
          course: group.course,
          teacher: group.teacher,
          room: group.room ?? "",
          daysOfWeek: group.days_of_week,
          startTime: group.start_time?.slice(0, 5) ?? "09:00",
          endTime: group.end_time?.slice(0, 5) ?? "10:30",
          maxStudents: group.max_students,
          startDate: group.start_date,
          endDate: group.end_date ?? "",
          status: group.status,
          price: Number(group.price ?? 0),
          billingDay: group.billing_day,
        }
      : EMPTY_VALUES
  );
  const [errors, setErrors] = useState<Partial<Record<keyof GroupProfileFormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof GroupProfileFormValues>(key: K, value: GroupProfileFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function toggleDay(day: DayOfWeek) {
    setValues((v) => ({
      ...v,
      daysOfWeek: v.daysOfWeek.includes(day) ? v.daysOfWeek.filter((d) => d !== day) : [...v.daysOfWeek, day],
    }));
    setErrors((e) => ({ ...e, daysOfWeek: undefined }));
  }

  async function handleSubmit() {
    const result = groupProfileSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof GroupProfileFormValues, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof GroupProfileFormValues;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        if (!organizationId) {
          toast.error(t("noOrganizationError"));
          return;
        }
        await createMutation.mutateAsync({ organizationId, ...result.data });
        toast.success(t("createdToast"));
      } else if (group) {
        await updateMutation.mutateAsync({ groupId: group.id, input: result.data });
        toast.success(t("updatedToast"));
      }
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        const mapped: Partial<Record<keyof GroupProfileFormValues, string>> = {};
        for (const [key, messages] of Object.entries(err.fieldErrors)) {
          const field = key === "max_students" ? "maxStudents" : key === "days_of_week" ? "daysOfWeek"
            : key === "start_date" ? "startDate" : key === "end_date" ? "endDate"
            : key === "start_time" ? "startTime" : key === "end_time" ? "endTime"
            : key === "billing_day" ? "billingDay"
            : (key as keyof GroupProfileFormValues);
          mapped[field] = messages[0];
        }
        setErrors(mapped);
        toast.error(t("fixHighlightedFields"));
      } else {
        toast.error(err instanceof ApiError ? err.message : t("genericError"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogBody>
        <div className="grid grid-cols-2 gap-3">
          <Input
            placeholder={t("fieldGroupName")}
            value={values.name}
            onChange={(e) => setField("name", e.target.value)}
            error={errors.name}
            wrapperClassName="col-span-2"
          />
          <Select
            placeholder={t("selectCoursePlaceholder")}
            options={(courses ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={values.course}
            onChange={(e) => setField("course", e.target.value)}
          />
          <Select
            placeholder={t("selectTeacherPlaceholder")}
            options={(teachers ?? []).map((tc) => ({ value: tc.id, label: tc.user_full_name }))}
            value={values.teacher}
            onChange={(e) => setField("teacher", e.target.value)}
          />
          {(errors.course || errors.teacher) && (
            <p className="col-span-2 -mt-2 text-xs text-red-500">{errors.course || errors.teacher}</p>
          )}
          <Input
            placeholder={t("fieldRoom")}
            value={values.room}
            onChange={(e) => setField("room", e.target.value)}
            error={errors.room}
          />
          <Select
            options={STATUS_OPTIONS}
            value={values.status}
            onChange={(e) => setField("status", e.target.value as GroupProfileFormValues["status"])}
          />

          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">{t("daysLabel")}</label>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((day) => (
                <Checkbox key={day} checked={values.daysOfWeek.includes(day)} onCheckedChange={() => toggleDay(day)} label={DAY_LABELS[day]} />
              ))}
            </div>
            {errors.daysOfWeek && <p className="mt-1 text-xs text-red-500">{errors.daysOfWeek}</p>}
          </div>

          <Input
            type="time"
            value={values.startTime}
            onChange={(e) => setField("startTime", e.target.value)}
            error={errors.startTime}
          />
          <Input
            type="time"
            value={values.endTime}
            onChange={(e) => setField("endTime", e.target.value)}
            error={errors.endTime}
          />
          <Input
            type="number"
            placeholder={t("fieldCapacity")}
            value={values.maxStudents}
            onChange={(e) => setField("maxStudents", Number(e.target.value))}
            error={errors.maxStudents}
          />
          <Input
            type="number"
            placeholder={t("fieldPrice")}
            value={values.price}
            onChange={(e) => setField("price", Number(e.target.value))}
            error={errors.price}
          />
          <Select
            placeholder={t("fieldBillingDay")}
            options={BILLING_DAYS.map((day) => ({ value: String(day), label: t("billingDayOption", { day }) }))}
            value={String(values.billingDay)}
            onChange={(e) => setField("billingDay", Number(e.target.value))}
            className="col-span-2"
          />
          <Input
            type="date"
            value={values.startDate}
            onChange={(e) => setField("startDate", e.target.value)}
            error={errors.startDate}
          />
          <Input
            type="date"
            value={values.endDate}
            onChange={(e) => setField("endDate", e.target.value)}
            error={errors.endDate}
          />

          {mode === "edit" && group && (
            <Input value={group.code} disabled placeholder={t("fieldGroupCode")} wrapperClassName="col-span-2" />
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
          {tc("cancel")}
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          {mode === "create" ? t("createButton") : tc("save")}
        </Button>
      </DialogFooter>
    </>
  );
}
