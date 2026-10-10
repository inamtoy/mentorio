from django.db import models
from django.utils import timezone

from common.db import schema_table
from common.models import CreatedAtMixin, OrganizationScopedMixin, UUIDPrimaryKeyMixin
from student.models.student_profile import STUDENT_STATUS_CHOICES


class StudentStatusHistory(UUIDPrimaryKeyMixin, CreatedAtMixin, OrganizationScopedMixin):
    """Immutable, append-only log of student status transitions — no API
    (see plan: audit-trail tables are read via reporting, not CRUD'd
    directly). Rows are written by the service/view that changes
    StudentProfile.status, never edited or deleted afterward.
    """

    student_profile = models.ForeignKey(
        "student.StudentProfile",
        on_delete=models.CASCADE,
        db_column="student_profile_id",
        related_name="status_history",
    )
    previous_status = models.CharField(max_length=20, choices=STUDENT_STATUS_CHOICES, blank=True, null=True)
    new_status = models.CharField(max_length=20, choices=STUDENT_STATUS_CHOICES)
    reason = models.TextField(blank=True, null=True)
    effective_date = models.DateField(default=timezone.localdate)
    changed_by = models.ForeignKey(
        "foundation.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = schema_table("student", "student_status_history")
        indexes = [
            models.Index(fields=["student_profile", "-created_at"], name="idx_student_status_hist_stu"),
            models.Index(fields=["organization", "-created_at"], name="idx_student_status_hist_org"),
        ]

    def __str__(self) -> str:
        return f"{self.student_profile_id}: {self.previous_status} -> {self.new_status}"
