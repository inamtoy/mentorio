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
import { useGroupsQuery } from "@/lib/queries/groups";
import { useCreateExamMutation, useUpdateExamMutation } from "@/lib/queries/exams";
import { examSchema, type ExamFormValues } from "@/lib/schemas/exam-schema";
import { ApiError } from "@/lib/api/client";
import type { Exam } from "@/lib/api/exams";

const EMPTY_VALUES: ExamFormValues = {
  title: "",
  group: "",
  date: "",
  startTime: "",
  duration: "90",
  room: "",
  maxScore: "100",
  questionCount: "",
};

interface ExamFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exam?: Exam | null;
}

export function ExamFormDialog({ open, onOpenChange, exam }: ExamFormDialogProps) {
  const t = useTranslations("AdminExams");
  const mode = exam ? "edit" : "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("formTitleNew") : t("formTitleEdit")}</DialogTitle>
        </DialogHeader>
        {open && <ExamFormFields key={exam?.id ?? "new"} exam={exam} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function ExamFormFields({
  exam,
  onOpenChange,
}: {
  exam?: Exam | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("AdminExams");
  const tc = useTranslations("Common");
  const mode = exam ? "edit" : "create";
  const organizationId = useAuthStore((s) => s.user?.organizationId);

  // Org-wide, not scoped to a teacher's own groups — an admin schedules an
  // exam for any group in the center, unlike the Teacher portal's own page.
  const { data: groups } = useGroupsQuery({ organizationId: organizationId ?? "" });
  const createMutation = useCreateExamMutation();
  const updateMutation = useUpdateExamMutation();

  const [values, setValues] = useState<ExamFormValues>(() =>
    exam
      ? {
          title: exam.title,
          group: exam.group,
          date: exam.date,
          startTime: exam.start_time.slice(0, 5),
          duration: String(exam.duration_minutes),
          room: exam.room ?? "",
          maxScore: String(exam.max_score),
          questionCount: String(exam.question_count),
        }
      : EMPTY_VALUES
  );
  const [errors, setErrors] = useState<Partial<Record<keyof ExamFormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof ExamFormValues>(key: K, value: ExamFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSubmit() {
    const result = examSchema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ExamFormValues, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof ExamFormValues;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    const input = {
      group: result.data.group,
      title: result.data.title,
      date: result.data.date,
      startTime: result.data.startTime,
      durationMinutes: Number(result.data.duration) || 90,
      room: result.data.room,
      maxScore: Number(result.data.maxScore) || 100,
      questionCount: Number(result.data.questionCount) || 0,
    };

    setSubmitting(true);
    try {
      if (mode === "create") {
        if (!organizationId) {
          toast.error(t("noOrganizationError"));
          return;
        }
        await createMutation.mutateAsync({ organizationId, ...input });
        toast.success(t("examScheduledToast"));
      } else if (exam) {
        await updateMutation.mutateAsync({ id: exam.id, input });
        toast.success(t("examUpdatedToast"));
      }
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        const mapped: Partial<Record<keyof ExamFormValues, string>> = {};
        for (const [key, messages] of Object.entries(err.fieldErrors)) {
          const field =
            key === "start_time" ? "startTime" : key === "duration_minutes" ? "duration" : key === "max_score" ? "maxScore"
              : key === "question_count" ? "questionCount" : (key as keyof ExamFormValues);
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
            placeholder={t("titlePlaceholder")}
            value={values.title}
            onChange={(e) => setField("title", e.target.value)}
            error={errors.title}
            wrapperClassName="col-span-2"
          />
          <Select
            placeholder={t("selectGroupPlaceholder")}
            options={(groups ?? []).map((g) => ({ value: g.id, label: g.name }))}
            value={values.group}
            onChange={(e) => setField("group", e.target.value)}
            className="col-span-2"
          />
          {errors.group && <p className="col-span-2 -mt-2 text-xs text-red-500">{errors.group}</p>}
          <Input
            type="date"
            value={values.date}
            onChange={(e) => setField("date", e.target.value)}
            error={errors.date}
          />
          <Input
            type="time"
            value={values.startTime}
            onChange={(e) => setField("startTime", e.target.value)}
            error={errors.startTime}
          />
          <Input
            type="number"
            min={15}
            placeholder={t("fieldDuration")}
            value={values.duration}
            onChange={(e) => setField("duration", e.target.value)}
            error={errors.duration}
          />
          <Input
            placeholder={t("roomPlaceholder")}
            value={values.room}
            onChange={(e) => setField("room", e.target.value)}
            error={errors.room}
          />
          <Input
            type="number"
            min={1}
            placeholder={t("fieldMaxScore")}
            value={values.maxScore}
            onChange={(e) => setField("maxScore", e.target.value)}
            error={errors.maxScore}
          />
          <Input
            type="number"
            min={0}
            placeholder={t("fieldQuestionCount")}
            value={values.questionCount}
            onChange={(e) => setField("questionCount", e.target.value)}
            error={errors.questionCount}
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
          {tc("cancel")}
        </Button>
        <Button onClick={handleSubmit} loading={submitting}>
          {mode === "create" ? t("scheduleExamButton") : tc("save")}
        </Button>
      </DialogFooter>
    </>
  );
}
