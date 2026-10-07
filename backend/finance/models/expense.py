from django.db import models
from django.utils import timezone

from common.db import schema_table
from common.models import OrganizationScopedMixin, SoftDeleteMixin, TimestampedMixin, UUIDPrimaryKeyMixin

EXPENSE_CATEGORY_CHOICES = [
    ("rent", "Rent"),
    ("utilities", "Utilities"),
    ("salaries_other", "Salaries (Other Staff)"),
    ("supplies", "Supplies"),
    ("marketing", "Marketing"),
    ("maintenance", "Maintenance"),
    ("equipment", "Equipment"),
    ("software", "Software"),
    ("taxes", "Taxes"),
    ("other", "Other"),
]

EXPENSE_STATUS_CHOICES = [
    ("pending", "Pending"),
    ("approved", "Approved"),
    ("rejected", "Rejected"),
    ("paid", "Paid"),
]

# Subset of finance.models.payment's PAYMENT_METHOD_CHOICES — no
# online/mobile_payment/payme/click here: those are gateway rails for
# *receiving* student payments, meaningless for the org's own outgoing
# spend. Shared by Expense and Payroll (both are money going out).
OUTGOING_PAYMENT_METHOD_CHOICES = [
    ("cash", "Cash"),
    ("card", "Card"),
    ("bank_transfer", "Bank Transfer"),
    ("other", "Other"),
]


class Expense(UUIDPrimaryKeyMixin, TimestampedMixin, SoftDeleteMixin, OrganizationScopedMixin):
    """Organizational spending (rent, supplies, utilities, ...). Trimmed from
    database/12-finance.sql: no separate `expense_categories` table (`category`
    is a plain choices field instead, same shape as Payment.payment_method —
    no hierarchy/budget UI exists to justify a whole manageable-list
    sub-feature), no `receipt_url` (no file-upload infra is wired into this
    backend at all — see finance.serializers' docstring note), no `metadata`
    JSONB (no consumer, same reasoning Invoice drops its unused DDL columns
    for).
    """

    branch = models.ForeignKey(
        "foundation.Branch", null=True, blank=True, on_delete=models.SET_NULL, db_column="branch_id",
        related_name="expenses",
    )
    category = models.CharField(max_length=20, choices=EXPENSE_CATEGORY_CHOICES)
    title = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="UZS")
    # Plain editable DateField (unlike Invoice.issued_date's auto_now_add) —
    # an expense is routinely logged after the fact for an earlier date
    # (e.g. last week's utility bill), same reasoning Invoice.due_date uses.
    expense_date = models.DateField(default=timezone.localdate)
    status = models.CharField(max_length=20, choices=EXPENSE_STATUS_CHOICES, default="pending")
    payment_method = models.CharField(max_length=20, choices=OUTGOING_PAYMENT_METHOD_CHOICES, null=True, blank=True)
    vendor_name = models.CharField(max_length=255, null=True, blank=True)
    notes = models.TextField(blank=True, null=True)
    # Bare UUIDs, not FKs — same convention as created_by everywhere else in
    # this app (finance/models/invoice.py, payment.py).
    approved_by = models.UUIDField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = schema_table("finance", "expenses")
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="chk_expenses_amount"),
        ]
        indexes = [
            models.Index(fields=["organization"], name="idx_expenses_org", condition=models.Q(deleted_at__isnull=True)),
            models.Index(
                fields=["organization", "status"], name="idx_expenses_status", condition=models.Q(deleted_at__isnull=True)
            ),
            models.Index(
                fields=["organization", "expense_date"], name="idx_expenses_date",
                condition=models.Q(deleted_at__isnull=True),
            ),
            models.Index(
                fields=["branch"], name="idx_expenses_branch",
                condition=models.Q(deleted_at__isnull=True, branch__isnull=False),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.amount} {self.currency})"
