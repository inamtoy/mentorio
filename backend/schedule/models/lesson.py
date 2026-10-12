from django.db import models

from common.db import schema_table
from common.models import OrganizationScopedMixin, SoftDeleteMixin, TimestampedMixin, UUIDPrimaryKeyMixin

LESSON_STATUS_CHOICES = [
    ("scheduled", "Scheduled"),
    ("completed", "Completed"),
    ("cancelled", "Cancelled"),
]


class Lesson(UUIDPrimaryKeyMixin, TimestampedMixin, SoftDeleteMixin, OrganizationScopedMixin):
    """One dated session of a Group. `groups.Group` already carries a
    recurring weekly template (`days_of_week`/`start_time`/`end_time`/
    `room`) but no concrete per-date rows — nothing generates or tracks
    individual sessions from it yet. This is that: like Attendance
    (`attendance.Attendance`), it's keyed on (group, date) rather than a
    fixed weekly slot, so a specific date's room/time/topic can differ from
    the group's usual pattern (a substitute room, a rescheduled time) and a
    single date can be explicitly cancelled without touching the recurring
    template. No direct `teacher` FK — same reasoning as Group and
    Attendance: it's derived read-only from `group.teacher` in the
    serializer, avoiding a second source of truth that could drift.
    """

    group = models.ForeignKey("groups.Group", on_delete=models.CASCADE, db_column="group_id", related_name="lessons")
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    room = models.CharField(max_length=100, blank=True, null=True)
    topic = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=20, choices=LESSON_STATUS_CHOICES, default="scheduled")
    notes = models.TextField(blank=True, null=True)
    created_by = models.UUIDField(null=True, blank=True)
    updated_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = schema_table("schedule", "lessons")
        constraints = [
            # Live, non-cancelled rows only: a deleted or cancelled lesson must
            # not stop the same slot being booked again (it used to 500).
            models.UniqueConstraint(
                fields=["group", "date", "start_time"],
                name="uq_lessons_group_date_start",
                condition=models.Q(deleted_at__isnull=True) & ~models.Q(status="cancelled"),
            ),
            models.CheckConstraint(condition=models.Q(end_time__gt=models.F("start_time")), name="chk_lessons_times"),
        ]
        indexes = [
            models.Index(fields=["group", "date"], name="idx_lessons_group_date", condition=models.Q(deleted_at__isnull=True)),
            models.Index(fields=["organization", "date"], name="idx_lessons_org_date", condition=models.Q(deleted_at__isnull=True)),
        ]

    def __str__(self) -> str:
        return f"{self.group_id} on {self.date} {self.start_time}-{self.end_time}"
