from django.db import models
from django.utils import timezone

from common.db import schema_table
from common.models import OrganizationScopedMixin, SoftDeleteMixin, TimestampedMixin, UUIDPrimaryKeyMixin

INVOICE_STATUS_CHOICES = [
    ("draft", "Draft"),
    ("pending", "Pending"),
    ("partially_paid", "Partially Paid"),
    ("paid", "Paid"),
    ("overdue", "Overdue"),
    ("cancelled", "Cancelled"),
    ("refunded", "Refunded"),
]


class Invoice(UUIDPrimaryKeyMixin, TimestampedMixin, SoftDeleteMixin, OrganizationScopedMixin):
    """A billing document for a student. Trimmed from
    database/12-finance.sql: no invoice_items (one flat total_amount per
    invoice — no line-item UI exists), no payment_plan_id (no Payment Plans
    module), no subtotal/discount_amount/tax_amount (nothing computes or
    displays them). `paid_amount`/`balance` are NOT stored columns — see
    finance.serializers.InvoiceSerializer, computed from summing this
    invoice's Payments, same derive-don't-store call as every rate/count
    elsewhere this session.
    """

    student_profile = models.ForeignKey(
        "student.StudentProfile", on_delete=models.RESTRICT, db_column="student_profile_id", related_name="invoices"
    )
    group = models.ForeignKey(
        "groups.Group", null=True, blank=True, on_delete=models.SET_NULL, db_column="group_id", related_name="invoices"
    )
    invoice_number = models.CharField(max_length=50)
    status = models.CharField(max_length=20, choices=INVOICE_STATUS_CHOICES, default="pending")
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="UZS")
    # default=timezone.localdate + editable=False, not auto_now_add=True:
    # Django's DateField auto_now_add stamps datetime.date.today() (the host
    # OS clock), which disagrees with settings.TIME_ZONE wherever Django
    # can't time.tzset() (Windows) — every date window in this app
    # (reports, filters) is computed with timezone.localdate(). editable=False
    # keeps it server-set/read-only exactly like auto_now_add did.
    issued_date = models.DateField(default=timezone.localdate, editable=False)
    due_date = models.DateField()
    notes = models.TextField(blank=True, null=True)
    created_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = schema_table("finance", "invoices")
        constraints = [
            models.UniqueConstraint(fields=["organization", "invoice_number"], name="uq_invoices_org_number"),
            models.CheckConstraint(condition=models.Q(total_amount__gte=0), name="chk_invoices_total"),
        ]
        indexes = [
            models.Index(fields=["organization"], name="idx_invoices_org", condition=models.Q(deleted_at__isnull=True)),
            models.Index(fields=["student_profile"], name="idx_invoices_student", condition=models.Q(deleted_at__isnull=True)),
            models.Index(
                fields=["organization", "status"], name="idx_invoices_status", condition=models.Q(deleted_at__isnull=True)
            ),
        ]

    def __str__(self) -> str:
        return f"{self.invoice_number} ({self.status})"
