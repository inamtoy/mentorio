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
import { toast } from "@/lib/store/toast-store";
import { useAuthStore } from "@/lib/store/auth-store";
import { useMyTeacherProfileQuery } from "@/lib/queries/teachers";
import { useGroupsQuery } from "@/lib/queries/groups";
import { useCreateLessonMutation } from "@/lib/queries/schedule";
// lessonSchema's own validation messages are shared with the still-
// untranslated Admin portal's identical "New Lesson" dialog, so they stay
// hardcoded English for now.
import { lessonSchema, type LessonFormValues } from "@/lib/schemas/lesson-schema";
import { ApiError } from "@/lib/api/client";
import { getLessonConflict } from "@/lib/api/schedule";

const EMPTY_VALUES: LessonFormValues = { group: "", date: "", startTime: "", endTime: "", room: "", topic: "" };

interface LessonFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LessonFormDialog({ open, onOpenChange }: LessonFormDialogProps) {
  const t = useTranslations("TeacherSchedule");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("formTitle")}</DialogTitle>
        </DialogHeader>
        {open && <LessonFormFields onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function LessonFormFields({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("TeacherSchedule");
  const tConflict = useTranslations("LessonConflict");
  const tc = useTranslations("Common");
  const organizationId = useAuthStore((s) => s.user?.organizationId);
  const { data: myProfile } = useMyTeacherProfileQuery();
  // Own groups only — LessonViewSet._check_owns_group rejects the create
  // otherwise; scoping the dropdown avoids a guaranteed-to-fail submission.
  const { data: groups } = useGroupsQuery({ organizationId: organizationId ?? "", teacher: myProfile?.id });
  const createMutation = useCreateLessonMutation();

  const [values, setValues] = useState<LessonFormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<Partial<Record<keyof LessonFormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof LessonFormValues>(key: K, value: LessonFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function handleGroupChange(groupId: string) {
    setField("group", groupId);
    const group = (groups ?? []).find((g) => g.id === groupId);
    if (group) {
      setValues((v) => ({
        ...v,
        group: groupId,
        room: v.room || group.room || "",
        startTime: v.startTime || group.start_time || "",
        endTime: v.endTime || group.end_time || "",
      }));
    }
  }

  async function handleSubmit() {
    const result = lessonSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof LessonFormValues, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof LessonFormValues;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    if (!organizationId) return;

    setSubmitting(true);
    try {
      await createMutation.mutateAsync({
        organizationId,
        group: result.data.group,
        date: result.data.date,
        startTime: result.data.startTime,
        endTime: result.data.endTime,
        room: result.data.room,
        topic: result.data.topic,
      });
      toast.success(t("lessonScheduledToast"));
      onOpenChange(false);
    } catch (err) {
      const conflict = getLessonConflict(err);
      if (conflict) {
        const message = tConflict(conflict.type, {
          room: conflict.room,
          group: conflict.group_name,
          teacher: conflict.teacher_name,
          start: conflict.start_time,
          end: conflict.end_time,
        });
        setErrors(conflict.type === "room" ? { room: message } : { startTime: message });
        toast.error(message);
      } else if (err instanceof ApiError && err.fieldErrors) {
        const mapped: Partial<Record<keyof LessonFormValues, string>> = {};
        for (const [key, messages] of Object.entries(err.fieldErrors)) {
          const field =
            key === "start_time" ? "startTime" : key === "end_time" ? "endTime" : (key as keyof LessonFormValues);
          mapped[field] = messages[0];
        }
        setErrors(mapped);
        toast.error(t("fixHighlightedFieldsToast"));
      } else {
        toast.error(err instanceof ApiError ? err.message : tc("somethingWentWrong"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogBody>
        <div className="grid grid-cols-2 gap-3">
          <Select
            placeholder={t("selectGroupPlaceholder")}
            options={(groups ?? []).map((g) => ({ value: g.id, label: g.name }))}
            value={values.group}
            onChange={(e) => handleGroupChange(e.target.value)}
            className="col-span-2"
          />
          {errors.group && <p className="col-span-2 -mt-2 text-xs text-red-500">{errors.group}</p>}
          <Input
            type="date"
            value={values.date}
            onChange={(e) => setField("date", e.target.value)}
            error={errors.date}
            wrapperClassName="col-span-2"
          />
          <Input
            type="time"
            placeholder={t("startTimePlaceholder")}
            value={values.startTime}
            onChange={(e) => setField("startTime", e.target.value)}
            error={errors.startTime}
          />
          <Input
            type="time"
            placeholder={t("endTimePlaceholder")}
            value={values.endTime}
            onChange={(e) => setField("endTime", e.target.value)}
            error={errors.endTime}
          />
          <Input
            placeholder={t("roomPlaceholder")}
            value={values.room}
            onChange={(e) => setField("room", e.target.value)}
            error={errors.room}
          />
          <Input
            placeholder={t("topicPlaceholder")}
            value={values.topic}
            onChange={(e) => setField("topic", e.target.value)}
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
          {tc("cancel")}
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          {t("scheduleButton")}
        </Button>
      </DialogFooter>
    </>
  );
}
