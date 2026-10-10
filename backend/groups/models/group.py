from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from common.db import schema_table
from common.models import OrganizationScopedMixin, SoftDeleteMixin, TimestampedMixin, UUIDPrimaryKeyMixin

GROUP_STATUS_CHOICES = [
    ("forming", "Forming"),
    ("active", "Active"),
    ("completed", "Completed"),
    ("cancelled", "Cancelled"),
    ("archived", "Archived"),
]

DAY_CHOICES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


class Group(UUIDPrimaryKeyMixin, TimestampedMixin, SoftDeleteMixin, OrganizationScopedMixin):
    """A class/group of students studying a course together — the core
    scheduling/enrollment unit. Trimmed from database/07-group-management.sql:
    `teacher` is a direct FK here rather than the DDL's group_teachers M:N
    bridge (nothing needs co-teaching yet — the frontend form only ever
    collects one teacher per group); `group_transfers`/`waiting_lists`
    aren't modeled at all (no UI consumes them yet). Both addable later
    without breaking this shape. `level` is deliberately NOT a column here —
    it's owned by `course.level`; exposed read-only via the serializer to
    avoid duplicating data the Course already has.
    """

    branch = models.ForeignKey(
        "foundation.Branch", null=True, blank=True, on_delete=models.SET_NULL, db_column="branch_id"
    )
    course = models.ForeignKey(
        "course.Course", on_delete=models.PROTECT, db_column="course_id", related_name="groups"
    )
    teacher = models.ForeignKey(
        "teacher.TeacherProfile", on_delete=models.PROTECT, db_column="teacher_profile_id", related_name="groups"
    )
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50)
    status = models.CharField(max_length=20, choices=GROUP_STATUS_CHOICES, default="forming")
    max_students = models.SmallIntegerField(default=15)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    room = models.CharField(max_length=100, blank=True, null=True)
    days_of_week = models.JSONField(default=list, blank=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, default="UZS")
    # Day of the month each student's monthly invoice falls due (e.g. 5 =
    # "pay by the 5th"). Capped at 28 so it exists in every month, February
    # included — no "31st in a 30-day month" rule to invent.
    billing_day = models.SmallIntegerField(default=1, validators=[MinValueValidator(1), MaxValueValidator(28)])
    notes = models.TextField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_by = models.UUIDField(null=True, blank=True)
    updated_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = schema_table("group", "groups")
        constraints = [
            models.UniqueConstraint(fields=["organization", "code"], name="uq_groups_org_code"),
            models.CheckConstraint(condition=models.Q(max_students__gt=0), name="chk_groups_max_students"),
            models.CheckConstraint(
                condition=models.Q(billing_day__gte=1, billing_day__lte=28), name="chk_groups_billing_day"
            ),
            models.CheckConstraint(
                condition=models.Q(end_date__isnull=True) | models.Q(end_date__gte=models.F("start_date")),
                name="chk_groups_dates",
            ),
            models.CheckConstraint(
                condition=models.Q(start_time__isnull=True)
                | models.Q(end_time__isnull=True)
                | models.Q(end_time__gt=models.F("start_time")),
                name="chk_groups_times",
            ),
        ]
        indexes = [
            models.Index(fields=["organization"], name="idx_groups_org", condition=models.Q(deleted_at__isnull=True)),
            models.Index(fields=["course"], name="idx_groups_course", condition=models.Q(deleted_at__isnull=True)),
            models.Index(fields=["teacher"], name="idx_groups_teacher", condition=models.Q(deleted_at__isnull=True)),
            models.Index(
                fields=["organization", "status"], name="idx_groups_status", condition=models.Q(deleted_at__isnull=True)
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"

    def delete(self, using=None, keep_parents=False):
        """Cascade the soft-delete to dependents — SoftDeleteMixin.delete()
        only touches this row's own deleted_at, so without this, a deleted
        group's GroupMember/Attendance rows stay "active" forever: they're
        found via select_related JOINs (which bypass the soft-delete
        manager's filtering entirely, unlike a normal .filter() lookup), so
        a soft-deleted group kept showing up as a live "Enrolled Group" on
        the Student detail panel.
        """
        now = timezone.now()
        self.members.filter(deleted_at__isnull=True).update(deleted_at=now)
        self.attendance_records.filter(deleted_at__isnull=True).update(deleted_at=now)
        super().delete(using=using, keep_parents=keep_parents)
