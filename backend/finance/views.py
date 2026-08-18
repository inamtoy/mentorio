from datetime import timedelta

from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.audit import audit_log, audited
from common.permissions import HasModulePermission, user_has_permission
from finance.filters import InvoiceFilter, PaymentFilter
from finance.models import Invoice, Payment
from finance.numbering import generate_invoice_number
from finance.serializers import InvoiceSerializer, PaymentSerializer
from finance.services import recompute_invoice_status
from foundation.views import SoftDeleteDestroyMixin
from groups.models import Group, GroupMember

FINANCE_PERMISSION_MAP = {
    "list": ("finance", "view"),
    "retrieve": ("finance", "view"),
    "create": ("finance", "create"),
    "update": ("finance", "update"),
    "partial_update": ("finance", "update"),
    "destroy": ("finance", "delete"),
}


class InvoiceViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    serializer_class = InvoiceSerializer
    permission_classes = [HasModulePermission]
    filterset_class = InvoiceFilter
    search_fields = ["invoice_number", "student_profile__user__first_name", "student_profile__user__last_name"]
    entity_type = "invoice"
    permission_map = FINANCE_PERMISSION_MAP

    def get_queryset(self):
        """`finance:view` is object-scoped for a student caller — see the
        comment on `DEFAULT_ROLE_PERMISSIONS["student"]`'s grant in
        foundation/permissions_catalog.py. Same pattern as
        homework.views.SubmissionViewSet.get_queryset(). center_admin (the
        only other role holding any finance permission) is unrestricted —
        checked via the actual `finance:create` grant, not merely "has no
        student_profile", since nothing stops one User from holding both a
        center_admin role and a StudentProfile in the same org.
        """
        qs = Invoice.objects.all().select_related("student_profile__user", "group").order_by("-created_at")
        student_profile = getattr(self.request.user, "student_profile", None)
        if student_profile is not None and not user_has_permission(self.request.user, "finance", "create"):
            return qs.filter(student_profile=student_profile)
        return qs

    @audited(action="create", entity_type="invoice")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="delete", entity_type="invoice")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["post"], url_path="self-create", permission_classes=[IsAuthenticated])
    def self_create(self, request):
        """A center_admin often adds a student to a Group without ever
        getting around to creating the matching Invoice (the two are
        independent rows — nothing enforces one implies the other). Lets a
        student generate their own Invoice for a group they're *already* a
        member of (never a group they merely wish to join — no self-
        enrollment/GroupMember creation here, see the plan's Context),
        deliberately NOT gated by the module-wide `finance:create` (that
        stays center_admin-only) — an explicit ownership/membership check
        instead, same style as payment_gateways.views.CheckoutInitiateView.
        Idempotent: replays return the invoice already created rather than
        a duplicate.
        """
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            raise PermissionDenied("Only students can self-create an invoice.")

        group = Group.objects.filter(pk=request.data.get("group")).select_related("course").first()
        if group is None:
            raise ValidationError({"group": "Group not found."})
        if not GroupMember.objects.filter(group=group, student_profile=student_profile, status="active").exists():
            raise PermissionDenied("You are not enrolled in this group.")

        price = group.price if group.price is not None else group.course.price
        if not price:
            # Rejects both "no price set" (None) and a zero/free price — a
            # zero-total Invoice could never be paid off through the
            # gateway flow (build_checkout_url refuses a <= 0 balance) or
            # via a direct Payment (amount > 0 DB constraint), so it would
            # sit at status="pending" forever with no way to resolve it.
            raise ValidationError({"group": "This group has no price set. Contact your center."})

        existing = (
            Invoice.objects.filter(student_profile=student_profile, group=group).exclude(status="cancelled").first()
        )
        if existing is not None:
            return Response(InvoiceSerializer(existing).data)

        invoice = Invoice.objects.create(
            organization=group.organization,
            student_profile=student_profile,
            group=group,
            invoice_number=generate_invoice_number(Invoice, group.organization),
            total_amount=price,
            currency=group.currency,
            due_date=timezone.now().date() + timedelta(days=7),
            created_by=request.user.id,
        )
        audit_log(
            request, action="create", entity_type="invoice", entity_id=str(invoice.id),
            metadata={"self_created": True, "group": str(group.id)},
        )
        return Response(InvoiceSerializer(invoice).data, status=201)


class PaymentViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    serializer_class = PaymentSerializer
    permission_classes = [HasModulePermission]
    filterset_class = PaymentFilter
    entity_type = "payment"
    permission_map = FINANCE_PERMISSION_MAP

    def get_queryset(self):
        """Same object-scoping as InvoiceViewSet.get_queryset() — a student
        can list/retrieve their own payment history (`finance:view`) but
        never create/update/delete one directly (`finance:create/update/
        delete` stay center_admin-only; a student's only path to a new
        Payment row is CheckoutInitiateView -> a Payme/Click webhook).
        """
        qs = Payment.objects.all().select_related("student_profile__user", "invoice").order_by("-created_at")
        student_profile = getattr(self.request.user, "student_profile", None)
        if student_profile is not None and not user_has_permission(self.request.user, "finance", "create"):
            return qs.filter(student_profile=student_profile)
        return qs

    def perform_create(self, serializer):
        payment = serializer.save()
        recompute_invoice_status(payment.invoice)

    # CLAUDE.md mandates payment events specifically in the audit trail
    # (common/audit.py's docstring: "auth, payment, role-change, deletion").
    @audited(action="create", entity_type="payment")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="delete", entity_type="payment")
    def destroy(self, request, *args, **kwargs):
        # SoftDeleteDestroyMixin.destroy() soft-deletes directly (never
        # calls perform_destroy()), so the invoice's status is recomputed
        # here rather than in a perform_destroy() override that would
        # never run.
        instance = self.get_object()
        invoice = instance.invoice
        response = super().destroy(request, *args, **kwargs)
        recompute_invoice_status(invoice)
        return response
