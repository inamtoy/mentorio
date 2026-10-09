from datetime import timedelta

from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.audit import audit_log, audited
from common.permissions import HasModulePermission, user_has_permission
from finance.filters import ExpenseFilter, InvoiceFilter, PayrollFilter, PaymentFilter
from finance.models import Expense, Invoice, Payment, Payroll
from finance.numbering import generate_invoice_number
from finance.serializers import ExpenseSerializer, InvoiceSerializer, PayrollSerializer, PaymentSerializer
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

# Extends FINANCE_PERMISSION_MAP with the custom status-transition actions
# Expense/PayrollViewSet add below. HasModulePermission falls through to
# "allow" for any view action key it doesn't recognize in permission_map, so
# without these explicit entries approve/reject/cancel/mark_paid would be
# left completely ungated — all four are "update"-level under the same
# center_admin-only `finance` module every other write here requires.
FINANCE_WRITE_ACTIONS_PERMISSION_MAP = {
    **FINANCE_PERMISSION_MAP,
    "approve": ("finance", "update"),
    "reject": ("finance", "update"),
    "cancel": ("finance", "update"),
    "mark_paid": ("finance", "update"),
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


class ExpenseViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    """No object-scoping on get_queryset() — unlike Invoice/Payment there is
    no student/teacher carve-out for this data at all (see
    FINANCE_PERMISSION_MAP's docstring note in foundation/permissions_catalog.py:
    finance is module-wide, center_admin-only). Org spend is purely internal/
    operational.
    """

    queryset = Expense.objects.all().select_related("branch").order_by("-expense_date")
    serializer_class = ExpenseSerializer
    permission_classes = [HasModulePermission]
    filterset_class = ExpenseFilter
    search_fields = ["title", "vendor_name"]
    entity_type = "expense"
    permission_map = FINANCE_WRITE_ACTIONS_PERMISSION_MAP

    @audited(action="create", entity_type="expense")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="delete", entity_type="expense")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    @audited(action="approve", entity_type="expense")
    def approve(self, request, pk=None):
        expense = self.get_object()
        if expense.status != "pending":
            raise ValidationError({"status": "Only a pending expense can be approved."})
        expense.status = "approved"
        expense.approved_by = request.user.id
        expense.save(update_fields=["status", "approved_by"])
        return Response(ExpenseSerializer(expense).data)

    @action(detail=True, methods=["post"])
    @audited(action="reject", entity_type="expense")
    def reject(self, request, pk=None):
        expense = self.get_object()
        if expense.status != "pending":
            raise ValidationError({"status": "Only a pending expense can be rejected."})
        expense.status = "rejected"
        expense.approved_by = request.user.id
        expense.save(update_fields=["status", "approved_by"])
        return Response(ExpenseSerializer(expense).data)

    @action(detail=True, methods=["post"], url_path="mark-paid")
    @audited(action="mark_paid", entity_type="expense")
    def mark_paid(self, request, pk=None):
        expense = self.get_object()
        if expense.status != "approved":
            raise ValidationError({"status": "Only an approved expense can be marked paid."})
        expense.status = "paid"
        expense.paid_at = timezone.now()
        payment_method = request.data.get("payment_method")
        if payment_method:
            expense.payment_method = payment_method
        expense.save(update_fields=["status", "paid_at", "payment_method"])
        return Response(ExpenseSerializer(expense).data)


class PayrollViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    """Same no-object-scoping reasoning as ExpenseViewSet above — payroll
    figures are center_admin-only. A teacher already sees their own pay
    *rate* via teacher_salary:view (teacher/views.py::TeacherSalaryViewSet);
    extending that same self-view to payroll *runs* is a materially larger
    change than this feature asked for and is left for a follow-up.
    """

    queryset = Payroll.objects.all().select_related("teacher_profile__user").order_by("-period_start")
    serializer_class = PayrollSerializer
    permission_classes = [HasModulePermission]
    filterset_class = PayrollFilter
    entity_type = "payroll"
    permission_map = FINANCE_WRITE_ACTIONS_PERMISSION_MAP

    @audited(action="create", entity_type="payroll")
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @audited(action="delete", entity_type="payroll")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    @audited(action="approve", entity_type="payroll")
    def approve(self, request, pk=None):
        payroll = self.get_object()
        if payroll.status != "draft":
            raise ValidationError({"status": "Only a draft payroll record can be approved."})
        payroll.status = "approved"
        payroll.approved_by = request.user.id
        payroll.save(update_fields=["status", "approved_by"])
        return Response(PayrollSerializer(payroll).data)

    @action(detail=True, methods=["post"])
    @audited(action="cancel", entity_type="payroll")
    def cancel(self, request, pk=None):
        payroll = self.get_object()
        if payroll.status not in ("draft", "approved"):
            raise ValidationError({"status": "A paid or already-cancelled payroll record cannot be cancelled."})
        payroll.status = "cancelled"
        payroll.save(update_fields=["status"])
        return Response(PayrollSerializer(payroll).data)

    @action(detail=True, methods=["post"], url_path="mark-paid")
    @audited(action="mark_paid", entity_type="payroll")
    def mark_paid(self, request, pk=None):
        payroll = self.get_object()
        if payroll.status != "approved":
            raise ValidationError({"status": "Only an approved payroll record can be marked paid."})
        payroll.status = "paid"
        payroll.paid_at = timezone.now()
        payment_method = request.data.get("payment_method")
        if payment_method:
            payroll.payment_method = payment_method
        payroll.save(update_fields=["status", "paid_at", "payment_method"])
        return Response(PayrollSerializer(payroll).data)
