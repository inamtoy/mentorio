from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied

from common.audit import audited
from common.permissions import HasModulePermission
from exams.filters import ExamFilter, ExamResultFilter
from exams.models import Exam, ExamResult
from exams.serializers import ExamResultSerializer, ExamSerializer
from foundation.views import SoftDeleteDestroyMixin

EXAM_PERMISSION_MAP = {
    "list": ("exams", "view"),
    "retrieve": ("exams", "view"),
    "create": ("exams", "create"),
    "update": ("exams", "update"),
    "partial_update": ("exams", "update"),
    "destroy": ("exams", "delete"),
}

EXAM_RESULT_PERMISSION_MAP = {
    "list": ("exams", "view"),
    "retrieve": ("exams", "view"),
    "create": ("exams", "create"),
    "update": ("exams", "update"),
    "partial_update": ("exams", "update"),
    "destroy": ("exams", "delete"),
}


class ExamViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    """No `get_queryset` override — reads unrestricted within the org, same
    treatment as LessonViewSet/AssignmentViewSet: this is schedule metadata
    (title/group/date/room), not personal data. Per-student scores live on
    ExamResultViewSet below, which IS row-scoped.
    """

    queryset = Exam.objects.all().select_related("group__course", "group__teacher__user").order_by("date", "start_time")
    serializer_class = ExamSerializer
    permission_classes = [HasModulePermission]
    filterset_class = ExamFilter
    search_fields = ["title", "group__name"]
    entity_type = "exam"
    permission_map = EXAM_PERMISSION_MAP

    def _check_owns_group(self, group):
        """Same ownership gap as AttendanceViewSet/LessonViewSet — a teacher
        may only schedule/manage exams for groups they teach; center admins
        (no linked teacher_profile) aren't restricted.
        """
        teacher_profile = getattr(self.request.user, "teacher_profile", None)
        if teacher_profile is not None and group.teacher_id != teacher_profile.id:
            raise PermissionDenied("You can only manage exams for groups you teach.")

    def perform_create(self, serializer):
        self._check_owns_group(serializer.validated_data["group"])
        serializer.save()

    def perform_update(self, serializer):
        group = serializer.validated_data.get("group", serializer.instance.group)
        self._check_owns_group(group)
        serializer.save()

    @audited(action="create", entity_type="exam")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="delete", entity_type="exam")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


class ExamResultViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    """A result carries a grade — same sensitivity class as Submission/
    Attendance, so reads are row-scoped: a student sees only their own
    result, a teacher only their own groups', center_admin unrestricted.
    Mirrors AttendanceViewSet.get_queryset()/SubmissionViewSet.get_queryset()
    exactly.
    """

    serializer_class = ExamResultSerializer
    permission_classes = [HasModulePermission]
    filterset_class = ExamResultFilter
    entity_type = "exam_result"
    permission_map = EXAM_RESULT_PERMISSION_MAP

    def get_queryset(self):
        qs = ExamResult.objects.all().select_related("exam__group", "student_profile__user").order_by("-created_at")
        user = self.request.user
        student_profile = getattr(user, "student_profile", None)
        teacher_profile = getattr(user, "teacher_profile", None)
        if student_profile is not None:
            return qs.filter(student_profile=student_profile)
        if teacher_profile is not None:
            return qs.filter(exam__group__teacher=teacher_profile)
        return qs

    def _check_owns_group(self, group):
        teacher_profile = getattr(self.request.user, "teacher_profile", None)
        if teacher_profile is not None and group.teacher_id != teacher_profile.id:
            raise PermissionDenied("You can only enter results for exams you teach.")

    def _check_owns_result(self, student_profile):
        """Defense in depth: no role is granted exams:create/update today
        (DEFAULT_ROLE_PERMISSIONS gives student view-only), but that grant
        is admin-editable — the moment any org's student role picks one up,
        this stops a student from writing a result onto any student_profile
        in the org, same as SubmissionViewSet.perform_create's equivalent
        check for homework.
        """
        caller_student_profile = getattr(self.request.user, "student_profile", None)
        if caller_student_profile is not None and student_profile.id != caller_student_profile.id:
            raise PermissionDenied("You can only manage your own exam result.")

    def perform_create(self, serializer):
        self._check_owns_group(serializer.validated_data["exam"].group)
        self._check_owns_result(serializer.validated_data["student_profile"])
        serializer.save()

    def perform_update(self, serializer):
        exam = serializer.validated_data.get("exam", serializer.instance.exam)
        student_profile = serializer.validated_data.get("student_profile", serializer.instance.student_profile)
        self._check_owns_group(exam.group)
        self._check_owns_result(student_profile)
        serializer.save()

    @audited(action="create", entity_type="exam_result")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="delete", entity_type="exam_result")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)
