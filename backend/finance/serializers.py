from decimal import Decimal

from rest_framework import serializers

from finance.models import Expense, Invoice, Payment, Payroll
from finance.numbering import generate_invoice_number
from finance.services import (
    NOT_BILLING_STATUSES,
    billing_period_of,
    invoice_paid_amount,
    month_invoice_q,
    payroll_net_amount,
)


class InvoiceSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student_profile.user.get_full_name", read_only=True)
    student_login_id = serializers.CharField(source="student_profile.user.login_id", read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True, default=None)
    paid_amount = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id", "organization", "student_profile", "student_name", "student_login_id", "group", "group_name",
            "invoice_number", "status", "total_amount", "paid_amount", "balance", "currency", "issued_date",
            "due_date", "billing_period", "notes", "created_at", "updated_at",
        ]
        # billing_period is only ever set by the Group billing flow
        # (finance.services.get_or_create_group_invoice); a hand-made invoice
        # is a one-off and stays null.
        read_only_fields = [
            "id", "invoice_number", "status", "issued_date", "billing_period", "created_at", "updated_at",
        ]

    def validate(self, attrs):
        """One bill per student, Group and month. An admin can bill a month
        by hand or let monthly billing do it (finance.services.
        get_or_create_group_invoice, which already defers to a hand-made
        one) — but never both, or the student owes the month twice.
        """
        group = attrs.get("group", getattr(self.instance, "group", None))
        student_profile = attrs.get("student_profile", getattr(self.instance, "student_profile", None))
        due_date = attrs.get("due_date", getattr(self.instance, "due_date", None))
        if group is not None and student_profile is not None and due_date is not None:
            clash = Invoice.objects.filter(
                month_invoice_q(billing_period_of(due_date)), group=group, student_profile=student_profile
            ).exclude(status__in=NOT_BILLING_STATUSES)
            if self.instance is not None:
                clash = clash.exclude(pk=self.instance.pk)
            existing = clash.first()
            if existing is not None:
                raise serializers.ValidationError({
                    "due_date": (
                        f"This student already has invoice {existing.invoice_number} for {group.name} this month. "
                        "Record the payment on that invoice instead of creating a second one."
                    )
                })
        return attrs

    def get_paid_amount(self, obj) -> Decimal:
        return invoice_paid_amount(obj)

    def get_balance(self, obj) -> Decimal:
        return obj.total_amount - self.get_paid_amount(obj)

    def create(self, validated_data):
        validated_data["invoice_number"] = generate_invoice_number(Invoice, validated_data["organization"])
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            validated_data["created_by"] = request.user.id
        return super().create(validated_data)


class PaymentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student_profile.user.get_full_name", read_only=True)
    invoice_number = serializers.CharField(source="invoice.invoice_number", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id", "organization", "invoice", "invoice_number", "student_profile", "student_name", "amount",
            "currency", "payment_method", "payment_date", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "student_profile", "payment_date", "created_at", "updated_at"]

    def validate(self, attrs):
        invoice = attrs.get("invoice") or getattr(self.instance, "invoice", None)
        if invoice is not None:
            attrs["student_profile"] = invoice.student_profile
            if not self.instance:
                remaining = invoice.total_amount - invoice_paid_amount(invoice)
                if attrs["amount"] > remaining:
                    raise serializers.ValidationError(
                        {"amount": f"Amount exceeds the remaining balance ({remaining} {invoice.currency})."}
                    )
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            validated_data["created_by"] = request.user.id
        return super().create(validated_data)


class ExpenseSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)

    class Meta:
        model = Expense
        fields = [
            "id", "organization", "branch", "branch_name", "category", "title", "amount", "currency",
            "expense_date", "status", "payment_method", "vendor_name", "notes", "approved_by", "paid_at",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "approved_by", "paid_at", "created_at", "updated_at"]

    def create(self, validated_data):
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            validated_data["created_by"] = request.user.id
        return super().create(validated_data)


class PayrollSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source="teacher_profile.user.get_full_name", read_only=True)
    net_amount = serializers.SerializerMethodField()

    class Meta:
        model = Payroll
        fields = [
            "id", "organization", "teacher_profile", "teacher_name", "period_start", "period_end", "base_salary",
            "bonus", "deductions", "tax_amount", "net_amount", "currency", "status", "payment_method", "paid_at",
            "notes", "created_by", "approved_by", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "status", "approved_by", "paid_at", "created_by", "created_at", "updated_at"]

    def get_net_amount(self, obj) -> Decimal:
        return payroll_net_amount(obj)

    def validate(self, attrs):
        """Pre-empts both DB constraints as normal 400s instead of an
        unhandled IntegrityError/500 — same convention exams/serializers.py
        (ExamSerializer/ExamResultSerializer) and billing/serializers.py
        already use for their own period/uniqueness checks.
        """
        period_start = attrs.get("period_start") or getattr(self.instance, "period_start", None)
        period_end = attrs.get("period_end") or getattr(self.instance, "period_end", None)
        if period_start and period_end and period_end <= period_start:
            raise serializers.ValidationError({"period_end": "Period end must be after period start."})

        teacher_profile = attrs.get("teacher_profile") or getattr(self.instance, "teacher_profile", None)
        if teacher_profile is not None and period_start and period_end:
            clash = Payroll.objects.filter(
                teacher_profile=teacher_profile, period_start=period_start, period_end=period_end
            )
            if self.instance is not None:
                clash = clash.exclude(pk=self.instance.pk)
            if clash.exists():
                raise serializers.ValidationError(
                    {"period_start": "A payroll record for this teacher and period already exists."}
                )
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            validated_data["created_by"] = request.user.id
        return super().create(validated_data)


class GroupPaymentSerializer(serializers.Serializer):
    """Input for GroupBillingViewSet.pay — one student's payment toward one
    Group's monthly fee. Gateway rails (payme/click) are left out: those
    Payments are only ever written by the gateway webhooks.
    """

    student_profile = serializers.UUIDField()
    period = serializers.DateField(input_formats=["%Y-%m", "%Y-%m-%d"])
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    payment_method = serializers.ChoiceField(
        choices=["cash", "card", "bank_transfer", "online", "mobile_payment", "other"], default="cash"
    )
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=1000)

    def validate_period(self, value):
        return value.replace(day=1)
