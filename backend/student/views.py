from django.db.models import Q
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied

from common.audit import audited
from common.permissions import HasModulePermission, user_has_permission
from foundation.views import SoftDeleteDestroyMixin
from groups.models import GroupMember
from student.filters import EmergencyContactFilter, StudentDocumentFilter, StudentParentFilter, StudentProfileFilter
from student.models import EmergencyContact, StudentDocument, StudentParent, StudentProfile
from student.serializers import (
    EmergencyContactSerializer,
    StudentDocumentSerializer,
    StudentParentSerializer,
    StudentProfileSerializer,
)

# Sub-resources (parents, emergency contacts, documents) share the "students"
# permission module rather than getting their own granular entries — the
# seeded permission catalog (database/15-seed-and-recommendations.sql) only
# defines one module per top-level domain, and splitting further isn't
# needed by anything the frontend does today (YAGNI).
STUDENT_PERMISSION_MAP = {
    "list": ("students", "view"),
    "retrieve": ("students", "view"),
    "create": ("students", "create"),
    "update": ("students", "update"),
    "partial_update": ("students", "update"),
    "destroy": ("students", "delete"),
}


# Fields a student may change on their own profile. Everything else
# (status, branch, student_code, user, organization, notes, metadata, the
# medical fields an admin records) stays admin-only, so the self-edit path
# can't be used to e.g. reactivate a suspended enrollment.
STUDENT_SELF_EDITABLE_FIELDS = {"education_level", "school_name", "previous_institution"}


def manages_students(user) -> bool:
    """Org-wide student management (center_admin, or a platform user via
    user_has_permission's system-role bypass). Keyed on `students:create`,
    which teacher/student roles never hold — `students:view`/`update` are
    granted to them too, so those can't tell an admin apart.
    """
    return user_has_permission(user, "students", "create")


def visible_student_profiles(user):
    """The StudentProfile rows this caller may see.

    `students:view` is module-wide for every role, so without this a
    student could list every classmate's phone, medical notes, parents and
    documents — and the Student portal itself did exactly that on every
    page load (it fetched the whole list and picked its own row out).

    - admins: the whole org (RLS still keeps it to their own org);
    - teachers: students in groups they teach (the Teacher portal reads
      its rosters through GroupMember, but this keeps the profile and
      sub-resource endpoints consistent with that);
    - students: only themselves.
    Checked teacher-first, like groups.views.GroupMemberViewSet, because one
    User can hold both a TeacherProfile and a StudentProfile.
    """
    qs = StudentProfile.objects.all()
    if manages_students(user):
        return qs
    q = Q(pk__in=[])
    teacher_profile = getattr(user, "teacher_profile", None)
    if teacher_profile is not None:
        taught = GroupMember.objects.filter(group__teacher=teacher_profile, group__deleted_at__isnull=True)
        q |= Q(pk__in=taught.values("student_profile_id"))
    student_profile = getattr(user, "student_profile", None)
    if student_profile is not None:
        q |= Q(pk=student_profile.pk)
    return qs.filter(q)


class StudentProfileViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    serializer_class = StudentProfileSerializer
    permission_classes = [HasModulePermission]
    filterset_class = StudentProfileFilter
    search_fields = ["student_code", "user__first_name", "user__last_name", "user__login_id"]
    entity_type = "student_profile"
    permission_map = STUDENT_PERMISSION_MAP

    def get_queryset(self):
        return visible_student_profiles(self.request.user).select_related("user", "branch").order_by("-created_at")

    def perform_update(self, serializer):
        """students:update grants a student edit rights on their OWN profile
        only (e.g. the Student Portal's Profile/Settings pages), and only
        the STUDENT_SELF_EDITABLE_FIELDS — same idea as
        foundation.views.UserViewSet.SELF_EDITABLE_FIELDS. Admins are
        unrestricted.
        """
        user = self.request.user
        if not manages_students(user):
            student_profile = getattr(user, "student_profile", None)
            if student_profile is None or serializer.instance.id != student_profile.id:
                raise PermissionDenied("You can only update your own student profile.")
            blocked = sorted(set(serializer.validated_data) - STUDENT_SELF_EDITABLE_FIELDS)
            if blocked:
                raise PermissionDenied(
                    f"You can't change {', '.join(blocked)} yourself. Ask your center's administrator to update it."
                )
        serializer.save()

    @audited(action="create", entity_type="student_profile")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="delete", entity_type="student_profile")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


class StudentSubResourceMixin:
    """Parents, emergency contacts and documents: readable for the
    profiles the caller can see (visible_student_profiles), writable only
    by admins. A student's `students:update` is meant for their own
    profile; through these endpoints it used to let any student rewrite any
    classmate's parent phone — where Telegram notifications and pickup
    permissions point. No portal other than Admin writes these.
    """

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(student_profile__in=visible_student_profiles(self.request.user).values("pk"))
        )

    def _require_manager(self):
        if not manages_students(self.request.user):
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


class StudentParentViewSet(StudentSubResourceMixin, SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = StudentParent.objects.all().select_related("student_profile", "telegram_link").order_by("-created_at")
    serializer_class = StudentParentSerializer
    permission_classes = [HasModulePermission]
    filterset_class = StudentParentFilter
    search_fields = ["first_name", "last_name", "phone", "email"]
    entity_type = "student_parent"
    permission_map = STUDENT_PERMISSION_MAP


class EmergencyContactViewSet(StudentSubResourceMixin, SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = EmergencyContact.objects.all().select_related("student_profile").order_by("-created_at")
    serializer_class = EmergencyContactSerializer
    permission_classes = [HasModulePermission]
    filterset_class = EmergencyContactFilter
    search_fields = ["full_name", "phone_primary"]
    entity_type = "emergency_contact"
    permission_map = STUDENT_PERMISSION_MAP


class StudentDocumentViewSet(StudentSubResourceMixin, SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = StudentDocument.objects.all().select_related("student_profile", "file").order_by("-created_at")
    serializer_class = StudentDocumentSerializer
    permission_classes = [HasModulePermission]
    filterset_class = StudentDocumentFilter
    search_fields = ["title", "document_number"]
    entity_type = "student_document"
    permission_map = STUDENT_PERMISSION_MAP
