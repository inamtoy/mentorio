from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from common.db import schema_table
from common.models import OrganizationScopedMixin, SoftDeleteMixin, TimestampedMixin, UUIDPrimaryKeyMixin

PLATFORM_PAYMENT_METHOD_CHOICES = [
    ("bank_transfer", "Bank Transfer"),
    ("cash", "Cash"),
    ("card", "Card"),
    ("other", "Other"),
]


class PlatformPayment(UUIDPrimaryKeyMixin, TimestampedMixin, SoftDeleteMixin, OrganizationScopedMixin):
    """A manually-confirmed payment from an organization against a
    PlatformInvoice — super_admin recording money already received (bank
    transfer, cash, ...), not a real-time gateway charge. Deliberately NOT
    wired to `payment_gateways` — that app is scoped to a *student* paying
    *their own center* online; Mentorio charging a center would need the
    platform's own Payme/Click merchant account, a distinct, larger future
    project (see plan doc's decision on this).
    """

    platform_invoice = models.ForeignKey(
        "billing.PlatformInvoice", on_delete=models.RESTRICT, db_column="platform_invoice_id", related_name="payments"
    )
    # MinValueValidator(0.01), not 0 — the DB constraint below is amount__gt
    # 0 (strictly positive, a $0 "payment" is meaningless), matching
    # finance.Payment's identical chk_payments_amount precedent.
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    currency = models.CharField(max_length=3, default="USD")
    method = models.CharField(max_length=20, choices=PLATFORM_PAYMENT_METHOD_CHOICES, default="bank_transfer")
    reference_note = models.CharField(max_length=255, blank=True, null=True)
    # default=timezone.localdate + editable=False, not auto_now_add=True:
    # Django's DateField auto_now_add stamps datetime.date.today() (the host
    # OS clock), which disagrees with settings.TIME_ZONE wherever Django
    # can't time.tzset() (Windows) — every date window in this app
    # (reports, filters) is computed with timezone.localdate(). editable=False
    # keeps it server-set/read-only exactly like auto_now_add did.
    payment_date = models.DateField(default=timezone.localdate, editable=False)
    recorded_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = schema_table("billing", "platform_payments")
        constraints = [
            models.CheckConstraint(condition=models.Q(amount__gt=0), name="chk_platform_payments_amount"),
        ]
        indexes = [
            models.Index(
                fields=["organization"], name="idx_platform_payments_org", condition=models.Q(deleted_at__isnull=True)
            ),
            models.Index(
                fields=["platform_invoice"], name="idx_platform_payments_invoice",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.amount} {self.currency} on {self.platform_invoice.invoice_number}"
