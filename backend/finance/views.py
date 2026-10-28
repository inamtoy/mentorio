from datetime import datetime

from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.audit import audit_log, audited
from common.permissions import HasModulePermission, user_has_permission
from finance import group_billing
from finance.filters import ExpenseFilter, InvoiceFilter, PayrollFilter, PaymentFilter
from finance.models import Expense, Invoice, Payment, Payroll
from finance.serializers import (
    ExpenseSerializer,
    GroupPaymentSerializer,
    InvoiceSerializer,
    PayrollSerializer,
    PaymentSerializer,
)
from finance.services import (
    billing_due_date,
    billing_period_of,
    get_or_create_group_invoice,
    invoice_paid_amount,
    recompute_invoice_status,
)
from foundation.views import SoftDeleteDestroyMixin
from groups.models import Group, GroupMember
from notifications.services import events as notification_events
from student.models import StudentProfile

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

    def perform_create(self, serializer):
        invoice = serializer.save()
        notification_events.invoice_issued(invoice)

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

        result = get_or_create_group_invoice(group, student_profile, created_by=request.user.id)
        if result is None:
            raise ValidationError({"group": "This group has no price set. Contact your center."})
        invoice, created = result
        if not created:
            return Response(InvoiceSerializer(invoice).data)

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


class GroupBillingViewSet(viewsets.GenericViewSet):
    """The Admin Finance page's main view: every Group with how many of its
    students have paid a given month, and recording a payment for one of
    them — see finance/group_billing.py for how a roster is derived.

        GET  finance/group-billing/?period=2026-10&search=...   Group summaries (paginated)
        GET  finance/group-billing/{group}/?period=2026-10      one Group + its students
        POST finance/group-billing/{group}/pay/                 record a payment

    `period` defaults to the current month; future months are refused.
    """

    permission_classes = [HasModulePermission]
    permission_map = {
        "list": ("finance", "view"),
        "retrieve": ("finance", "view"),
        "pay": ("finance", "create"),
    }

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # A student holds `finance:view` too (scoped to their own invoices,
        # see InvoiceViewSet.get_queryset) — but a whole Group's roster is
        # other students' payment status. Staff-only, using the same
        # `finance:create` test InvoiceViewSet uses to tell the two apart.
        if getattr(request.user, "student_profile", None) is not None and not user_has_permission(
            request.user, "finance", "create"
        ):
            raise PermissionDenied("Only center staff can view group billing.")

    def _period(self, raw):
        current = billing_period_of(timezone.localdate())
        if not raw:
            return current
        try:
            period = datetime.strptime(raw, "%Y-%m").date()
        except ValueError as exc:
            raise ValidationError({"period": "Use the YYYY-MM format, e.g. 2026-10."}) from exc
        if period > current:
            raise ValidationError({"period": "Future months have nothing to collect yet."})
        return period

    def _group(self, pk):
        group = Group.objects.filter(pk=pk).select_related("course", "teacher__user").first()
        if group is None:
            raise NotFound("Group not found.")
        return group

    def list(self, request):
        period = self._period(request.query_params.get("period"))
        groups, rosters = group_billing.build_roster(period)

        search = (request.query_params.get("search") or "").strip()
        if search:
            # Matches a Group by its own name/code or by any student in it —
            # the student names their Group, or the admin types the name.
            students = group_billing.matching_student_ids(search)
            needle = search.lower()
            groups = {
                gid: g for gid, g in groups.items()
                if needle in g.name.lower() or needle in g.code.lower()
                or any(r.student_profile_id in students for r in rosters[gid])
            }

        today = timezone.localdate()
        summaries = sorted(
            (group_billing.group_summary(g, rosters[gid], today) for gid, g in groups.items()),
            key=lambda s: s["name"].lower(),
        )
        page = self.paginate_queryset(summaries)
        return self.get_paginated_response(page)

    def retrieve(self, request, pk=None):
        group = self._group(pk)
        period = self._period(request.query_params.get("period"))
        return Response(self._detail(group, period))

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        """Records a payment toward one student's bill for this Group and
        month. With no invoice for the month yet, raises the monthly one
        first — the admin never creates an invoice by hand. With several
        (e.g. a hand-made one-off next to the monthly one), the amount is
        applied to them earliest-due first, one Payment per invoice touched.
        All-or-nothing, with the invoices locked so two admins recording at
        once can't overpay them.
        """
        group = self._group(pk)
        serializer = GroupPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        period = self._period(data["period"].strftime("%Y-%m"))

        _groups, rosters = group_billing.build_roster(period, group_ids=[group.pk])
        student_id = str(data["student_profile"])
        if not any(r.student_profile_id == student_id for r in rosters.get(str(group.pk), [])):
            raise ValidationError({"student_profile": "This student is not in this group for that month."})

        student = StudentProfile.objects.get(pk=student_id)
        current = billing_period_of(timezone.localdate())
        with transaction.atomic():
            invoices = list(
                group_billing.period_invoices(period)
                .filter(group=group, student_profile=student)
                .select_for_update()
                .order_by("due_date", "created_at")
            )
            invoice_created = False
            if not invoices:
                result = get_or_create_group_invoice(
                    group, student, period=period, created_by=request.user.id, notify=False,
                    # A past month is due on its billing day; the current month
                    # keeps get_or_create_group_invoice's joiner-friendly default.
                    due_date=billing_due_date(group, period) if period < current else None,
                )
                if result is None:
                    raise ValidationError({"group": "This group has no monthly price. Set one on the group first."})
                invoice, invoice_created = result
                invoices = [Invoice.objects.select_for_update().get(pk=invoice.pk)]

            open_invoices = [(i, i.total_amount - invoice_paid_amount(i)) for i in invoices]
            open_invoices = [(i, balance) for i, balance in open_invoices if balance > 0]
            remaining = sum((balance for _i, balance in open_invoices), 0)
            if remaining <= 0:
                raise ValidationError({"amount": "This month is already fully paid."})
            if data["amount"] > remaining:
                raise ValidationError(
                    {"amount": f"Amount exceeds the remaining balance ({remaining} {invoices[0].currency})."}
                )

            to_apply = data["amount"]
            for invoice, balance in open_invoices:
                if to_apply <= 0:
                    break
                amount = min(to_apply, balance)
                to_apply -= amount
                payment = Payment.objects.create(
                    organization_id=invoice.organization_id, invoice=invoice, student_profile=student,
                    amount=amount, currency=invoice.currency, payment_method=data["payment_method"],
                    notes=data.get("notes") or None, created_by=request.user.id,
                )
                recompute_invoice_status(invoice)
                audit_log(
                    request, action="create", entity_type="payment", entity_id=str(payment.id),
                    new_values={"amount": str(payment.amount), "payment_method": payment.payment_method},
                    metadata={
                        "group": str(group.pk), "period": period.isoformat(), "invoice": str(invoice.pk),
                        "invoice_created": invoice_created,
                    },
                )

        return Response(self._detail(group, period), status=201)

    def _detail(self, group, period):
        _groups, rosters = group_billing.build_roster(period, group_ids=[group.pk])
        rows = rosters.get(str(group.pk), [])
        today = timezone.localdate()
        return {
            **group_billing.group_summary(group, rows, today),
            "period": period.strftime("%Y-%m"),
            "members": group_billing.roster_members(rows, today),
        }


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
