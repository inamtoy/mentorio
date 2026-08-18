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
import { teacherProfileSchema, type TeacherProfileFormValues } from "@/lib/schemas/teacher-profile-schema";
import {
  useCreateTeacherMutation,
  useTeacherRoleQuery,
  useUpdateTeacherMutation,
  useUserQuery,
} from "@/lib/queries/teachers";
import { ApiError } from "@/lib/api/client";
import type { TeacherProfile } from "@/lib/api/teachers";

const EMPTY_VALUES: TeacherProfileFormValues = {
  firstName: "",
  lastName: "",
  phone: "",
  gender: "male",
  teacherCode: "",
  status: "active",
  employmentType: "full_time",
  specialization: "",
  salary: 0,
};

interface TeacherFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacher?: TeacherProfile | null;
}

export function TeacherFormDialog({ open, onOpenChange, teacher }: TeacherFormDialogProps) {
  const t = useTranslations("AdminTeachers");
  const mode = teacher ? "edit" : "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("formTitleAdd") : t("formTitleEdit")}</DialogTitle>
        </DialogHeader>
        {open && (
          <TeacherFormFields key={teacher?.id ?? "new"} teacher={teacher} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TeacherFormFields({
  teacher,
  onOpenChange,
}: {
  teacher?: TeacherProfile | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("AdminTeachers");
  const tc = useTranslations("Common");
  const mode = teacher ? "edit" : "create";
  const organizationId = useAuthStore((s) => s.user?.organizationId);

  const GENDER_OPTIONS = [
    { value: "male", label: t("genderMale") },
    { value: "female", label: t("genderFemale") },
    { value: "other", label: t("genderOther") },
  ];

  const STATUS_OPTIONS = [
    { value: "active", label: t("statusActive") },
    { value: "on_leave", label: t("statusOnLeave") },
    { value: "terminated", label: t("statusTerminated") },
    { value: "inactive", label: t("statusInactive") },
    { value: "pending", label: t("statusPending") },
  ];

  const EMPLOYMENT_OPTIONS = [
    { value: "full_time", label: t("employmentFullTime") },
    { value: "part_time", label: t("employmentPartTime") },
    { value: "contract", label: t("employmentContract") },
    { value: "freelance", label: t("employmentFreelance") },
    { value: "intern", label: t("employmentIntern") },
  ];

  const { data: teacherRole } = useTeacherRoleQuery(organizationId);
  const { data: userRecord, isLoading: userLoading } = useUserQuery(teacher?.user ?? null);
  const createMutation = useCreateTeacherMutation();
  const updateMutation = useUpdateTeacherMutation();

  const [values, setValues] = useState<TeacherProfileFormValues>(EMPTY_VALUES);
  const [initialized, setInitialized] = useState(mode === "create");
  const [errors, setErrors] = useState<Partial<Record<keyof TeacherProfileFormValues, string>>>({});
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // Adjusted during render, not in an effect — same one-time-on-load
  // pattern as StudentFormDialog's fields component, see its comment.
  if (mode === "edit" && !initialized && userRecord && teacher) {
    setInitialized(true);
    setValues({
      firstName: userRecord.first_name,
      lastName: userRecord.last_name,
      phone: userRecord.phone,
      gender: userRecord.gender ?? "male",
      teacherCode: teacher.teacher_code,
      status: teacher.status,
      employmentType: teacher.employment_type,
      specialization: "",
      salary: 0,
    });
  }

  function setField<K extends keyof TeacherProfileFormValues>(key: K, value: TeacherProfileFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSubmit() {
    const schema = mode === "create" ? teacherProfileSchema : teacherProfileSchema.omit({ specialization: true, salary: true });
    const result = schema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof TeacherProfileFormValues, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof TeacherProfileFormValues;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    if (mode === "create") {
      if (!password || password.length < 6) {
        setPasswordError(t("passwordMinLength"));
        return;
      }
      if (password !== confirmPassword) {
        setPasswordError(t("passwordMismatch"));
        return;
      }
      if (!organizationId || !teacherRole) {
        toast.error(t("teacherRoleMissing"));
        return;
      }

      setSubmitting(true);
      try {
        await createMutation.mutateAsync({
          organizationId,
          teacherRoleId: teacherRole.id,
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone,
          gender: values.gender,
          password,
          teacherCode: values.teacherCode,
          status: values.status,
          employmentType: values.employmentType,
          specialization: values.specialization,
          salary: values.salary,
        });
        toast.success(t("createdToast"));
        onOpenChange(false);
      } catch (err) {
        applyServerErrors(err, setErrors, t);
      } finally {
        setSubmitting(false);
      }
    } else if (teacher) {
      setSubmitting(true);
      try {
        await updateMutation.mutateAsync({
          profileId: teacher.id,
          input: {
            userId: teacher.user,
            firstName: values.firstName,
            lastName: values.lastName,
            phone: values.phone,
            gender: values.gender,
            teacherCode: values.teacherCode,
            status: values.status,
            employmentType: values.employmentType,
          },
        });
        toast.success(t("updatedToast"));
        onOpenChange(false);
      } catch (err) {
        applyServerErrors(err, setErrors, t);
      } finally {
        setSubmitting(false);
      }
    }
  }

  if (mode === "edit" && (userLoading || !initialized)) {
    return (
      <DialogBody>
        <p className="text-sm text-slate-400 py-8 text-center">{t("loadingTeacher")}</p>
      </DialogBody>
    );
  }

  return (
    <>
      <DialogBody>
        <div className="grid grid-cols-2 gap-3">
          <Input
            placeholder={t("fieldFirstName")}
            value={values.firstName}
            onChange={(e) => setField("firstName", e.target.value)}
            error={errors.firstName}
          />
          <Input
            placeholder={t("fieldLastName")}
            value={values.lastName}
            onChange={(e) => setField("lastName", e.target.value)}
            error={errors.lastName}
          />
          <Input
            placeholder={t("fieldPhone")}
            value={values.phone}
            onChange={(e) => setField("phone", e.target.value)}
            error={errors.phone}
          />
          <Select
            options={GENDER_OPTIONS}
            value={values.gender}
            onChange={(e) => setField("gender", e.target.value as TeacherProfileFormValues["gender"])}
          />
          <Input
            placeholder={t("fieldTeacherCode")}
            value={values.teacherCode}
            onChange={(e) => setField("teacherCode", e.target.value)}
            error={errors.teacherCode}
          />
          <Select
            options={EMPLOYMENT_OPTIONS}
            value={values.employmentType}
            onChange={(e) => setField("employmentType", e.target.value as TeacherProfileFormValues["employmentType"])}
          />
          <Select
            options={STATUS_OPTIONS}
            value={values.status}
            onChange={(e) => setField("status", e.target.value as TeacherProfileFormValues["status"])}
            className="col-span-2"
          />

          {mode === "edit" && teacher && (
            <Input value={teacher.user_login_id} disabled placeholder={t("fieldLoginId")} className="col-span-2" />
          )}

          {mode === "create" && (
            <>
              <Input
                placeholder={t("fieldSpecialization")}
                value={values.specialization}
                onChange={(e) => setField("specialization", e.target.value)}
                error={errors.specialization}
                className="col-span-2"
              />
              <Input
                type="number"
                placeholder={t("fieldMonthlySalary")}
                value={values.salary}
                onChange={(e) => setField("salary", Number(e.target.value))}
                error={errors.salary}
                className="col-span-2"
              />
              <Input
                type="password"
                placeholder={t("fieldPassword")}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(undefined); }}
                error={passwordError}
              />
              <Input
                type="password"
                placeholder={t("fieldConfirmPassword")}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(undefined); }}
              />
              <p className="col-span-2 -mt-2 text-xs text-slate-400">
                {t("loginIdHint")}
              </p>
            </>
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

function applyServerErrors(
  err: unknown,
  setErrors: React.Dispatch<React.SetStateAction<Partial<Record<keyof TeacherProfileFormValues, string>>>>,
  t: ReturnType<typeof useTranslations<"AdminTeachers">>
) {
  if (err instanceof ApiError && err.fieldErrors) {
    const mapped: Partial<Record<keyof TeacherProfileFormValues, string>> = {};
    for (const [key, messages] of Object.entries(err.fieldErrors)) {
      const field = key === "teacher_code" ? "teacherCode" : key === "employment_type" ? "employmentType" : (key as keyof TeacherProfileFormValues);
      mapped[field] = messages[0];
    }
    setErrors(mapped);
    toast.error(t("fixHighlightedFields"));
  } else {
    toast.error(err instanceof ApiError ? err.message : t("genericError"));
  }
}
