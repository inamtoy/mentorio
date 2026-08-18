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
import { studentSchema, type StudentFormValues } from "@/lib/schemas/student-schema";
import { useCreateStudentMutation, useStudentRoleQuery, useUpdateStudentMutation, useUserQuery } from "@/lib/queries/students";
import { ApiError } from "@/lib/api/client";
import type { StudentProfile } from "@/lib/api/students";

const EMPTY_VALUES: StudentFormValues = {
  firstName: "",
  lastName: "",
  phone: "",
  gender: "male",
  dateOfBirth: "",
  studentCode: "",
  status: "active",
  parentName: "",
  parentPhone: "",
};

interface StudentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student?: StudentProfile | null;
}

export function StudentFormDialog({ open, onOpenChange, student }: StudentFormDialogProps) {
  const t = useTranslations("AdminStudents");
  const mode = student ? "edit" : "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("formTitleAdd") : t("formTitleEdit")}</DialogTitle>
        </DialogHeader>
        {open && (
          <StudentFormFields key={student?.id ?? "new"} student={student} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StudentFormFields({
  student,
  onOpenChange,
}: {
  student?: StudentProfile | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("AdminStudents");
  const tc = useTranslations("Common");
  const mode = student ? "edit" : "create";
  const organizationId = useAuthStore((s) => s.user?.organizationId);

  const GENDER_OPTIONS = [
    { value: "male", label: t("genderMale") },
    { value: "female", label: t("genderFemale") },
    { value: "other", label: t("genderOther") },
  ];

  const STATUS_OPTIONS = [
    { value: "active", label: t("statusActive") },
    { value: "on_leave", label: t("statusOnLeave") },
    { value: "transferred", label: t("statusTransferred") },
    { value: "graduated", label: t("statusGraduated") },
    { value: "expelled", label: t("statusExpelled") },
    { value: "inactive", label: t("statusInactive") },
    { value: "pending", label: t("statusPending") },
  ];

  const { data: studentRole } = useStudentRoleQuery(organizationId);
  const { data: userRecord, isLoading: userLoading } = useUserQuery(student?.user ?? null);
  const createMutation = useCreateStudentMutation();
  const updateMutation = useUpdateStudentMutation();

  const [values, setValues] = useState<StudentFormValues>(EMPTY_VALUES);
  const [initialized, setInitialized] = useState(mode === "create");
  const [errors, setErrors] = useState<Partial<Record<keyof StudentFormValues, string>>>({});
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // Adjusted during render, not in an effect — this only ever fires once
  // per mount (guarded by `initialized`), the moment userRecord finishes
  // loading, so doing it synchronously mid-render (React's own endorsed
  // pattern for one-time state derived from an async source, see "Storing
  // information from previous renders" in the React docs) avoids the
  // extra post-mount render pass a useEffect would add here.
  if (mode === "edit" && !initialized && userRecord && student) {
    setInitialized(true);
    setValues({
      firstName: userRecord.first_name,
      lastName: userRecord.last_name,
      phone: userRecord.phone,
      gender: userRecord.gender ?? "male",
      dateOfBirth: userRecord.date_of_birth ?? "",
      studentCode: student.student_code,
      status: student.status,
      parentName: "",
      parentPhone: "",
    });
  }

  function setField<K extends keyof StudentFormValues>(key: K, value: StudentFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSubmit() {
    const schema = mode === "create" ? studentSchema : studentSchema.omit({ parentName: true, parentPhone: true });
    const result = schema.safeParse(values);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof StudentFormValues, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof StudentFormValues;
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
      if (!organizationId || !studentRole) {
        toast.error(t("studentRoleMissing"));
        return;
      }

      setSubmitting(true);
      try {
        await createMutation.mutateAsync({
          organizationId,
          studentRoleId: studentRole.id,
          firstName: values.firstName,
          lastName: values.lastName,
          phone: values.phone,
          gender: values.gender,
          dateOfBirth: values.dateOfBirth,
          password,
          studentCode: values.studentCode,
          status: values.status,
          parentName: values.parentName,
          parentPhone: values.parentPhone,
        });
        toast.success(t("createdToast"));
        onOpenChange(false);
      } catch (err) {
        applyServerErrors(err, setErrors, t);
      } finally {
        setSubmitting(false);
      }
    } else if (student) {
      setSubmitting(true);
      try {
        await updateMutation.mutateAsync({
          profileId: student.id,
          input: {
            userId: student.user,
            firstName: values.firstName,
            lastName: values.lastName,
            phone: values.phone,
            gender: values.gender,
            dateOfBirth: values.dateOfBirth,
            studentCode: values.studentCode,
            status: values.status,
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
        <p className="text-sm text-slate-400 py-8 text-center">{t("loadingStudent")}</p>
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
            onChange={(e) => setField("gender", e.target.value as StudentFormValues["gender"])}
          />
          <Input
            type="date"
            value={values.dateOfBirth}
            onChange={(e) => setField("dateOfBirth", e.target.value)}
            error={errors.dateOfBirth}
          />
          <Input
            placeholder={t("fieldStudentCode")}
            value={values.studentCode}
            onChange={(e) => setField("studentCode", e.target.value)}
            error={errors.studentCode}
          />
          <Select
            options={STATUS_OPTIONS}
            value={values.status}
            onChange={(e) => setField("status", e.target.value as StudentFormValues["status"])}
            className="col-span-2"
          />

          {mode === "edit" && student && (
            <Input value={student.user_login_id} disabled placeholder={t("fieldLoginId")} className="col-span-2" />
          )}

          {mode === "create" && (
            <>
              <Input
                placeholder={t("fieldParentName")}
                value={values.parentName}
                onChange={(e) => setField("parentName", e.target.value)}
                error={errors.parentName}
              />
              <Input
                placeholder={t("fieldParentPhone")}
                value={values.parentPhone}
                onChange={(e) => setField("parentPhone", e.target.value)}
                error={errors.parentPhone}
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
  setErrors: React.Dispatch<React.SetStateAction<Partial<Record<keyof StudentFormValues, string>>>>,
  t: ReturnType<typeof useTranslations<"AdminStudents">>
) {
  if (err instanceof ApiError && err.fieldErrors) {
    const mapped: Partial<Record<keyof StudentFormValues, string>> = {};
    for (const [key, messages] of Object.entries(err.fieldErrors)) {
      const field = key === "student_code" ? "studentCode" : (key as keyof StudentFormValues);
      mapped[field] = messages[0];
    }
    setErrors(mapped);
    toast.error(t("fixHighlightedFields"));
  } else {
    toast.error(err instanceof ApiError ? err.message : t("genericError"));
  }
}
