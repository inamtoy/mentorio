from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied

from common.audit import audited
from common.permissions import HasModulePermission
from foundation.views import SoftDeleteDestroyMixin
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


class StudentProfileViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = StudentProfile.objects.all().select_related("user", "branch").order_by("-created_at")
    serializer_class = StudentProfileSerializer
    permission_classes = [HasModulePermission]
    filterset_class = StudentProfileFilter
    search_fields = ["student_code", "user__first_name", "user__last_name", "user__login_id"]
    entity_type = "student_profile"
    permission_map = STUDENT_PERMISSION_MAP

    def perform_update(self, serializer):
        """students:update grants a student edit rights on their OWN profile
        only (e.g. the Student Portal's Profile/Settings pages) — same
        pattern as teacher/views.py::TeacherProfileViewSet.perform_update.
        HasModulePermission is module-level only, so without this a student
        with students:update could PATCH any student's row in the org.
        center_admin (module-wide grant, no student_profile attribute) is
        unaffected.
        """
        student_profile = getattr(self.request.user, "student_profile", None)
        if student_profile is not None and serializer.instance.id != student_profile.id:
            raise PermissionDenied("You can only update your own student profile.")
        serializer.save()

    @audited(action="create", entity_type="student_profile")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="delete", entity_type="student_profile")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


class StudentParentViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = StudentParent.objects.all().select_related("student_profile").order_by("-created_at")
    serializer_class = StudentParentSerializer
    permission_classes = [HasModulePermission]
    filterset_class = StudentParentFilter
    search_fields = ["first_name", "last_name", "phone", "email"]
    entity_type = "student_parent"
    permission_map = STUDENT_PERMISSION_MAP


class EmergencyContactViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = EmergencyContact.objects.all().select_related("student_profile").order_by("-created_at")
    serializer_class = EmergencyContactSerializer
    permission_classes = [HasModulePermission]
    filterset_class = EmergencyContactFilter
    search_fields = ["full_name", "phone_primary"]
    entity_type = "emergency_contact"
    permission_map = STUDENT_PERMISSION_MAP


class StudentDocumentViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = StudentDocument.objects.all().select_related("student_profile", "file").order_by("-created_at")
    serializer_class = StudentDocumentSerializer
    permission_classes = [HasModulePermission]
    filterset_class = StudentDocumentFilter
    search_fields = ["title", "document_number"]
    entity_type = "student_document"
    permission_map = STUDENT_PERMISSION_MAP
