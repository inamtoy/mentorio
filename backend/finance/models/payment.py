from django.db import models
from django.utils import timezone

from common.db import schema_table
from common.models import OrganizationScopedMixin, SoftDeleteMixin, TimestampedMixin, UUIDPrimaryKeyMixin

PAYMENT_METHOD_CHOICES = [
    ("cash", "Cash"),
    ("card", "Card"),
    ("bank_transfer", "Bank Transfer"),
    ("online", "Online"),
    ("mobile_payment", "Mobile Payment"),
    # Gateway-attributed payments, written by payment_gateways' webhook
    # handlers (never chosen by an admin recording a payment by hand) —
    # distinct from "online" so the ledger shows which rail actually moved
    # the money.
    ("payme", "Payme"),
    ("click", "Click"),
    ("other", "Other"),
]


class Payment(UUIDPrimaryKeyMixin, TimestampedMixin, SoftDeleteMixin, OrganizationScopedMixin):
    """A single payment applied against an Invoice. `student_profile` is
    denormalized from `invoice.student_profile` (matches database/12-finance.sql)
    so a student's payment history can be queried without joining through
    every invoice. This is the real "transaction log" at this app's scope —
    no separate `transactions` table, see finance/models/invoice.py's docstring.
    """

    invoice = models.ForeignKey(
        "finance.Invoice", on_delete=models.RESTRICT, db_column="invoice_id", related_name="payments"
    )
    student_profile = models.ForeignKey(
        "student.StudentProfile", on_delete=models.RESTRICT, db_column="student_profile_id", related_name="payments"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="UZS")
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default="cash")
    # default=timezone.localdate + editable=False, not auto_now_add=True:
    # Django's DateField auto_now_add stamps datetime.date.today() (the host
    # OS clock), which disagrees with settings.TIME_ZONE wherever Django
    # can't time.tzset() (Windows) — every date window in this app
    # (reports, filters) is computed with timezone.localdate(). editable=False
    # keeps it server-set/read-only exactly like auto_now_add did.
    payment_date = models.DateField(default=timezone.localdate, editable=False)
    notes = models.TextField(blank=True, null=True)
    created_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = schema_table("finance", "payments")
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="chk_payments_amount"),
        ]
        indexes = [
            models.Index(fields=["organization"], name="idx_payments_org", condition=models.Q(deleted_at__isnull=True)),
            models.Index(fields=["invoice"], name="idx_payments_invoice", condition=models.Q(deleted_at__isnull=True)),
            models.Index(
                fields=["student_profile"], name="idx_payments_student", condition=models.Q(deleted_at__isnull=True)
            ),
        ]

    def __str__(self) -> str:
        return f"{self.amount} {self.currency} on {self.invoice.invoice_number}"
