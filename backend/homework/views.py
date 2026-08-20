from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError

from common.audit import audited
from common.permissions import HasModulePermission
from foundation.views import SoftDeleteDestroyMixin
from homework.filters import AssignmentFilter, SubmissionFilter
from homework.models import Assignment, Submission
from homework.serializers import AssignmentSerializer, SubmissionSerializer

ASSIGNMENT_PERMISSION_MAP = {
    "list": ("assignments", "view"),
    "retrieve": ("assignments", "view"),
    "create": ("assignments", "create"),
    "update": ("assignments", "update"),
    "partial_update": ("assignments", "update"),
    "destroy": ("assignments", "delete"),
}

SUBMISSION_PERMISSION_MAP = {
    "list": ("submissions", "view"),
    "retrieve": ("submissions", "view"),
    "create": ("submissions", "create"),
    "update": ("submissions", "update"),
    "partial_update": ("submissions", "update"),
    "destroy": ("submissions", "delete"),
}


class AssignmentViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = Assignment.objects.all().select_related("group").order_by("-due_date")
    serializer_class = AssignmentSerializer
    permission_classes = [HasModulePermission]
    filterset_class = AssignmentFilter
    search_fields = ["title", "group__name"]
    entity_type = "assignment"
    permission_map = ASSIGNMENT_PERMISSION_MAP

    def _check_owns_group(self, group):
        """Same ownership gap as AttendanceViewSet — a teacher may only post
        assignments to groups they teach; center admins aren't restricted.
        """
        teacher_profile = getattr(self.request.user, "teacher_profile", None)
        if teacher_profile is not None and group.teacher_id != teacher_profile.id:
            raise PermissionDenied("You can only manage assignments for groups you teach.")

    def perform_create(self, serializer):
        self._check_owns_group(serializer.validated_data["group"])
        serializer.save()

    def perform_update(self, serializer):
        group = serializer.validated_data.get("group", serializer.instance.group)
        self._check_owns_group(group)
        serializer.save()

    @audited(action="create", entity_type="assignment")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="delete", entity_type="assignment")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


class SubmissionViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    """Read access is scoped by role — unlike Lesson/Assignment, a
    Submission carries a grade, which is sensitive enough that
    `submissions:view` being module-wide (per HasModulePermission, same as
    every other module) can't be allowed to mean "see everyone's scores".
    Mirrors Finance's reasoning for keeping its own module center_admin-only
    entirely; here the fix is row-level instead, since student/teacher both
    still need real (just narrower) access.
    """

    serializer_class = SubmissionSerializer
    permission_classes = [HasModulePermission]
    filterset_class = SubmissionFilter
    entity_type = "submission"
    permission_map = SUBMISSION_PERMISSION_MAP

    def get_queryset(self):
        qs = Submission.objects.all().select_related("assignment__group", "student_profile__user").order_by("-submitted_at")
        user = self.request.user
        student_profile = getattr(user, "student_profile", None)
        teacher_profile = getattr(user, "teacher_profile", None)
        if student_profile is not None:
            return qs.filter(student_profile=student_profile)
        if teacher_profile is not None:
            return qs.filter(assignment__group__teacher=teacher_profile)
        return qs

    def perform_create(self, serializer):
        """A student can only ever submit as themselves — the client-sent
        `student_profile` (if any) is ignored outright rather than merely
        validated, so there's no path where a crafted payload submits on
        someone else's behalf. Non-students (teacher/center_admin) must
        supply it explicitly — matches Payment's serializer needing an
        explicit `student_profile` too.
        """
        student_profile = getattr(self.request.user, "student_profile", None)
        if student_profile is not None:
            serializer.save(student_profile=student_profile)
        elif "student_profile" not in serializer.validated_data:
            # student_profile is required=False at the serializer level
            # purely so a student's own submit (which never sends it) isn't
            # rejected before perform_create ever runs — a non-student
            # omitting it entirely is still a real error, not something to
            # let fall through to a raw IntegrityError from the NOT NULL
            # column.
            raise ValidationError({"student_profile": "This field is required."})
        else:
            serializer.save()

    def perform_update(self, serializer):
        instance = serializer.instance
        user = self.request.user
        student_profile = getattr(user, "student_profile", None)
        teacher_profile = getattr(user, "teacher_profile", None)

        if student_profile is not None:
            if instance.student_profile_id != student_profile.id:
                raise PermissionDenied("You can only update your own submission.")
            if instance.score is not None:
                raise PermissionDenied("This submission has already been graded and can no longer be edited.")
            # A student editing their own ungraded work can't sneak in a
            # score/feedback/grading field — those are grader-only.
            for field in ("score", "feedback", "graded_by", "graded_at"):
                serializer.validated_data.pop(field, None)
        elif teacher_profile is not None and instance.assignment.group.teacher_id != teacher_profile.id:
            raise PermissionDenied("You can only grade submissions for groups you teach.")

        serializer.save()

    @audited(action="delete", entity_type="submission")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)
