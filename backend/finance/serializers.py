from decimal import Decimal

from rest_framework import serializers

from finance.models import Expense, Invoice, Payment, Payroll
from finance.numbering import generate_invoice_number
from finance.services import invoice_paid_amount, payroll_net_amount


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
            "due_date", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "invoice_number", "status", "issued_date", "created_at", "updated_at"]

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
