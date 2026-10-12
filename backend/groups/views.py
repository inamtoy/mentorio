from rest_framework import viewsets

from common.audit import audit_log, audited
from common.permissions import HasModulePermission, user_has_permission
from finance.serializers import InvoiceSerializer
from finance.services import get_or_create_group_invoice
from foundation.views import SoftDeleteDestroyMixin
from groups.filters import GroupFilter, GroupMemberFilter
from groups.models import Group, GroupMember
from groups.serializers import GroupMemberSerializer, GroupSerializer

GROUP_PERMISSION_MAP = {
    "list": ("groups", "view"),
    "retrieve": ("groups", "view"),
    "create": ("groups", "create"),
    "update": ("groups", "update"),
    "partial_update": ("groups", "update"),
    "destroy": ("groups", "delete"),
}


class GroupViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    queryset = Group.objects.all().select_related("branch", "course", "teacher__user").order_by("-created_at")
    serializer_class = GroupSerializer
    permission_classes = [HasModulePermission]
    filterset_class = GroupFilter
    search_fields = ["name", "code", "room"]
    entity_type = "group"
    permission_map = GROUP_PERMISSION_MAP

    @audited(action="create", entity_type="group")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="delete", entity_type="group")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


class GroupMemberViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    serializer_class = GroupMemberSerializer
    permission_classes = [HasModulePermission]
    filterset_class = GroupMemberFilter
    entity_type = "group_member"
    permission_map = GROUP_PERMISSION_MAP

    def get_queryset(self):
        """`groups:view` is module-wide (matches every other role's grant on
        this module) — without this, any student holding it could list
        *every* other student's phone/login_id via GroupMemberSerializer's
        `student_phone`/`student_login_id` fields. Object-scoped for a
        student caller the same way finance.views.InvoiceViewSet/
        homework.views.SubmissionViewSet already are; center_admin/teacher
        (the only other roles with `groups` access) stay unrestricted.
        Checked in this order (mirrors homework.views.SubmissionViewSet)
        because nothing stops one User from holding both a TeacherProfile
        and a StudentProfile — narrowing on student_profile alone would
        wrongly cut a dual-role teacher's roster down to their own row.
        """
        qs = GroupMember.objects.all().select_related("student_profile__user", "group__course").order_by("-created_at")
        user = self.request.user
        if getattr(user, "teacher_profile", None) is not None:
            return qs
        student_profile = getattr(user, "student_profile", None)
        if student_profile is not None:
            return qs.filter(student_profile=student_profile)
        return qs

    def create(self, request, *args, **kwargs):
        self.issued_invoice = None
        response = super().create(request, *args, **kwargs)
        # The invoice raised alongside the enrollment (or null: no price, the
        # caller opted out, or lacks finance:create) — lets the admin UI say
        # "enrolled, invoice for 500 000 UZS issued" without a second request.
        response.data["invoice"] = InvoiceSerializer(self.issued_invoice).data if self.issued_invoice else None
        return response

    def perform_create(self, serializer):
        """Enrolling a student bills their first month at the Group's monthly
        price, in the same transaction — admins otherwise had to remember to
        create a matching Invoice by hand and type the amount every time.
        Skipped silently (enrollment still succeeds) when the Group has no
        price, the caller sent create_invoice=false, or the caller can't
        create invoices: `groups:create` alone must not become a way to
        raise finance documents.
        """
        create_invoice = serializer.validated_data.pop("create_invoice", True)
        member = serializer.save()
        if not create_invoice or member.status != "active":
            return
        if not user_has_permission(self.request.user, "finance", "create"):
            return
        result = get_or_create_group_invoice(member.group, member.student_profile, created_by=self.request.user.id)
        if result is None:
            return
        invoice, created = result
        if created:
            self.issued_invoice = invoice
            audit_log(
                self.request, action="create", entity_type="invoice", entity_id=str(invoice.id),
                metadata={"enrollment": str(member.id), "group": str(member.group_id)},
            )

    def perform_update(self, serializer):
        serializer.validated_data.pop("create_invoice", None)
        serializer.save()
