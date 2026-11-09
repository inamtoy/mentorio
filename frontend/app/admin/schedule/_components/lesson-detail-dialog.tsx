"use client";

import { Clock, MapPin, User, BookOpen } from "lucide-react";
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
import { StatusBadge } from "@/components/ui/badge";
import { toast } from "@/lib/store/toast-store";
import { useUpdateLessonMutation } from "@/lib/queries/schedule";
import { ApiError } from "@/lib/api/client";
import type { Lesson } from "@/lib/api/schedule";

interface LessonDetailDialogProps {
  lesson: Lesson | null;
  onOpenChange: (open: boolean) => void;
}

export function LessonDetailDialog({ lesson, onOpenChange }: LessonDetailDialogProps) {
  const t = useTranslations("AdminSchedule");
  const updateMutation = useUpdateLessonMutation();

  async function setStatus(status: "completed" | "cancelled") {
    if (!lesson) return;
    try {
      await updateMutation.mutateAsync({ id: lesson.id, input: { status } });
      toast.success(status === "cancelled" ? t("lessonCancelledToast") : t("lessonCompletedToast"));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  return (
    <Dialog open={!!lesson} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        {lesson && (
          <>
            <DialogHeader>
              <DialogTitle>{lesson.group_name}</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{lesson.topic || "—"}</span>
                <StatusBadge status={lesson.status} />
              </div>
              <InfoRow icon={<BookOpen className="h-4 w-4" />} label={t("courseLabel")} value={lesson.course_name ?? "—"} />
              <InfoRow icon={<User className="h-4 w-4" />} label={t("teacherLabel")} value={lesson.teacher_name} />
              <InfoRow icon={<MapPin className="h-4 w-4" />} label={t("roomLabel")} value={lesson.room || "—"} />
              <InfoRow
                icon={<Clock className="h-4 w-4" />}
                label={t("timeLabel")}
                value={`${lesson.start_time.slice(0, 5)} – ${lesson.end_time.slice(0, 5)}`}
              />
            </DialogBody>
            {lesson.status === "scheduled" && (
              <DialogFooter>
                <Button variant="outline" onClick={() => setStatus("cancelled")} loading={updateMutation.isPending}>
                  {t("cancelLessonButton")}
                </Button>
                <Button onClick={() => setStatus("completed")} loading={updateMutation.isPending}>
                  {t("markCompletedButton")}
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-400 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-slate-400 block">{label}</span>
        <span className="text-sm text-slate-700 font-medium">{value}</span>
      </div>
    </div>
  );
}
