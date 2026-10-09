from django.db import models

from common.db import schema_table
from common.models import OrganizationScopedMixin, SoftDeleteMixin, TimestampedMixin, UUIDPrimaryKeyMixin
from finance.models.expense import OUTGOING_PAYMENT_METHOD_CHOICES

PAYROLL_STATUS_CHOICES = [
    ("draft", "Draft"),
    ("approved", "Approved"),
    ("paid", "Paid"),
    ("cancelled", "Cancelled"),
]


class Payroll(UUIDPrimaryKeyMixin, TimestampedMixin, SoftDeleteMixin, OrganizationScopedMixin):
    """One payroll run for one teacher for one pay period. Trimmed from
    database/12-finance.sql: no `lessons_taught`/`students_count`/
    `calculation_details` — those would back an auto-calculation engine
    (deriving base_salary from Attendance + GroupMember for hourly/
    per_lesson/per_student TeacherSalary types) that doesn't exist yet; a
    center_admin fills in the amounts by hand here, same as every other
    manually-entered total in this app. No "calculated" status for the same
    reason — nothing in this app auto-calculates a payroll row.

    `net_amount` is deliberately NOT a stored/generated column — same
    derive-don't-store call finance.models.invoice.Invoice already makes for
    paid_amount/balance (see finance.services.payroll_net_amount).
    """

    teacher_profile = models.ForeignKey(
        "teacher.TeacherProfile", on_delete=models.RESTRICT, db_column="teacher_profile_id",
        related_name="payroll_records",
    )
    period_start = models.DateField()
    period_end = models.DateField()
    base_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    bonus = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="UZS")
    status = models.CharField(max_length=20, choices=PAYROLL_STATUS_CHOICES, default="draft")
    payment_method = models.CharField(max_length=20, choices=OUTGOING_PAYMENT_METHOD_CHOICES, null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, null=True)
    created_by = models.UUIDField(null=True, blank=True)
    approved_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = schema_table("finance", "payroll")
        constraints = [
            models.UniqueConstraint(
                fields=["teacher_profile", "period_start", "period_end"], name="uq_payroll_teacher_period"
            ),
            models.CheckConstraint(condition=models.Q(period_end__gt=models.F("period_start")), name="chk_payroll_period"),
            models.CheckConstraint(
                condition=models.Q(base_salary__gte=0)
                & models.Q(bonus__gte=0)
                & models.Q(deductions__gte=0)
                & models.Q(tax_amount__gte=0),
                name="chk_payroll_amounts",
            ),
        ]
        indexes = [
            models.Index(
                fields=["organization", "period_start"], name="idx_payroll_org_period",
                condition=models.Q(deleted_at__isnull=True),
            ),
            models.Index(
                fields=["teacher_profile", "period_start"], name="idx_payroll_teacher",
                condition=models.Q(deleted_at__isnull=True),
            ),
            models.Index(
                fields=["organization", "status"], name="idx_payroll_status", condition=models.Q(deleted_at__isnull=True)
            ),
        ]

    def __str__(self) -> str:
        return f"{self.teacher_profile_id}: {self.period_start} - {self.period_end} ({self.status})"
