from django.db import transaction
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied

from common.audit import audited
from common.permissions import HasModulePermission, user_has_permission
from foundation.views import SoftDeleteDestroyMixin
from teacher.filters import (
    TeacherAvailabilityFilter,
    TeacherDocumentFilter,
    TeacherProfileFilter,
    TeacherSalaryFilter,
    TeacherSpecializationFilter,
)
from teacher.models import TeacherAvailability, TeacherDocument, TeacherProfile, TeacherSalary, TeacherSpecialization
from teacher.serializers import (
    TeacherAvailabilitySerializer,
    TeacherDocumentSerializer,
    TeacherProfileSerializer,
    TeacherSalarySerializer,
    TeacherSpecializationSerializer,
)

# Fields a teacher may change on their own profile (the Teacher portal's
# Profile page). status, branch, teacher_code, employment dates, notes and
# metadata stay admin-only.
TEACHER_SELF_EDITABLE_FIELDS = {"bio", "experience_years", "education_degree", "university"}


def manages_teachers(user) -> bool:
    """Org-wide teacher management (center_admin, or a platform user).
    Keyed on `teachers:create` because teachers themselves hold
    `teachers:view`/`update` for their own profile."""
    return user_has_permission(user, "teachers", "create")


TEACHER_PERMISSION_MAP = {
    "list": ("teachers", "view"),
    "retrieve": ("teachers", "view"),
    "create": ("teachers", "create"),
    "update": ("teachers", "update"),
    "partial_update": ("teachers", "update"),
    "destroy": ("teachers", "delete"),
}

# Separate from TEACHER_PERMISSION_MAP — see foundation/permissions_catalog.py's
# "teacher_salary" docstring note for why compensation data can't reuse the
# module-wide `teachers` grant a teacher already holds for their own profile.
TEACHER_SALARY_PERMISSION_MAP = {
    "list": ("teacher_salary", "view"),
    "retrieve": ("teacher_salary", "view"),
    "create": ("teacher_salary", "create"),
    "update": ("teacher_salary", "update"),
    "partial_update": ("teacher_salary", "update"),
    "destroy": ("teacher_salary", "delete"),
}


class TeacherProfileViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = TeacherProfile.objects.all().select_related("user", "branch").order_by("-created_at")
    serializer_class = TeacherProfileSerializer
    permission_classes = [HasModulePermission]
    filterset_class = TeacherProfileFilter
    search_fields = ["teacher_code", "user__first_name", "user__last_name", "user__login_id"]
    entity_type = "teacher_profile"
    permission_map = TEACHER_PERMISSION_MAP

    def perform_update(self, serializer):
        """teacher:update grants a teacher edit rights on their OWN profile
        only (e.g. the Teacher Portal's Profile page), and only the
        TEACHER_SELF_EDITABLE_FIELDS — HasModulePermission is module-level
        only, so without this a teacher could PATCH any teacher's row, or
        their own status/branch/teacher_code. Admins are unrestricted.
        """
        user = self.request.user
        if not manages_teachers(user):
            teacher_profile = getattr(user, "teacher_profile", None)
            if teacher_profile is None or serializer.instance.id != teacher_profile.id:
                raise PermissionDenied("You can only update your own teacher profile.")
            blocked = sorted(set(serializer.validated_data) - TEACHER_SELF_EDITABLE_FIELDS)
            if blocked:
                raise PermissionDenied(
                    f"You can't change {', '.join(blocked)} yourself. Ask your center's administrator to update it."
                )
        serializer.save()

    @audited(action="create", entity_type="teacher_profile")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="delete", entity_type="teacher_profile")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


class TeacherSalaryViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = TeacherSalary.objects.all().select_related("teacher_profile").order_by("-effective_from")
    serializer_class = TeacherSalarySerializer
    permission_classes = [HasModulePermission]
    filterset_class = TeacherSalaryFilter
    entity_type = "teacher_salary"
    permission_map = TEACHER_SALARY_PERMISSION_MAP

    def get_queryset(self):
        """teacher_salary:view is module-wide for center_admin (sees every
        teacher's pay) but object-scoped for teacher — a teacher holds no
        create/update/delete grant on this module at all (see
        foundation/permissions_catalog.py), so narrowing view access here is
        the only enforcement point that matters. Mirrors the "own record
        only" pattern finance/payment_gateways use for the student role.
        """
        queryset = super().get_queryset()
        teacher_profile = getattr(self.request.user, "teacher_profile", None)
        if teacher_profile is not None:
            return queryset.filter(teacher_profile=teacher_profile)
        return queryset

    def _deactivate_other_active_rows(self, instance):
        """TeacherSalary.__doc__: 'Only one row should be is_active per
        teacher at a time... the API layer is responsible for deactivating
        the previous row when activating a new one' — there's no DB-level
        partial unique index enforcing it, so this is that responsibility.
        Runs inside the same transaction as the save that (re)activated
        `instance`, after it committed its own row, so the exclude(pk=...)
        can't ever deactivate the row we just meant to keep active.
        """
        if not instance.is_active:
            return
        TeacherSalary.objects.filter(teacher_profile=instance.teacher_profile, is_active=True).exclude(
            pk=instance.pk
        ).update(is_active=False)

    def perform_create(self, serializer):
        with transaction.atomic():
            instance = serializer.save()
            self._deactivate_other_active_rows(instance)

    def perform_update(self, serializer):
        with transaction.atomic():
            instance = serializer.save()
            self._deactivate_other_active_rows(instance)

    @audited(action="create", entity_type="teacher_salary")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="update", entity_type="teacher_salary")
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @audited(action="delete", entity_type="teacher_salary")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


class TeacherSubResourceWriteMixin:
    """Availability, specializations and documents are written only from
    the Admin portal. A teacher's module-wide `teachers:update` exists for
    their own profile; through these endpoints it used to let any teacher
    edit or delete any colleague's rows.
    """

    def _require_manager(self):
        if not manages_teachers(self.request.user):
            raise PermissionDenied("Only your center's administrator can change this.")

    def perform_create(self, serializer):
        self._require_manager()
        serializer.save()

    def perform_update(self, serializer):
        self._require_manager()
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        self._require_manager()
        return super().destroy(request, *args, **kwargs)


class TeacherAvailabilityViewSet(TeacherSubResourceWriteMixin, SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = TeacherAvailability.objects.all().select_related("teacher_profile").order_by("day_of_week", "start_time")
    serializer_class = TeacherAvailabilitySerializer
    permission_classes = [HasModulePermission]
    filterset_class = TeacherAvailabilityFilter
    entity_type = "teacher_availability"
    permission_map = TEACHER_PERMISSION_MAP


class TeacherSpecializationViewSet(TeacherSubResourceWriteMixin, SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = TeacherSpecialization.objects.all().select_related("teacher_profile").order_by("-is_primary", "subject_name")
    serializer_class = TeacherSpecializationSerializer
    permission_classes = [HasModulePermission]
    filterset_class = TeacherSpecializationFilter
    search_fields = ["subject_name"]
    entity_type = "teacher_specialization"
    permission_map = TEACHER_PERMISSION_MAP


class TeacherDocumentViewSet(TeacherSubResourceWriteMixin, SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = TeacherDocument.objects.all().select_related("teacher_profile", "file").order_by("-created_at")
    serializer_class = TeacherDocumentSerializer
    permission_classes = [HasModulePermission]
    filterset_class = TeacherDocumentFilter
    search_fields = ["title", "document_number"]
    entity_type = "teacher_document"
    permission_map = TEACHER_PERMISSION_MAP

    def get_queryset(self):
        """Identity documents (passport numbers, diplomas) — a teacher sees
        only their own; admins see the whole org. Same "own record only"
        narrowing as TeacherSalaryViewSet.get_queryset."""
        queryset = super().get_queryset()
        if manages_teachers(self.request.user):
            return queryset
        teacher_profile = getattr(self.request.user, "teacher_profile", None)
        if teacher_profile is None:
            return queryset.none()
        return queryset.filter(teacher_profile=teacher_profile)
