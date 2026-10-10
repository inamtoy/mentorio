from django.db import models
from django.utils import timezone

from common.db import schema_table
from common.models import OrganizationScopedMixin, SoftDeleteMixin, TimestampedMixin, UUIDPrimaryKeyMixin

STUDENT_STATUS_CHOICES = [
    ("active", "Active"),
    ("inactive", "Inactive"),
    ("graduated", "Graduated"),
    ("expelled", "Expelled"),
    ("transferred", "Transferred"),
    ("on_leave", "On Leave"),
    ("pending", "Pending"),
]


class StudentProfile(UUIDPrimaryKeyMixin, TimestampedMixin, SoftDeleteMixin, OrganizationScopedMixin):
    """Extended student-specific data, 1:1 with foundation.User — keeps
    student-only fields (enrollment, medical notes, ...) off the universal
    user record, matching teacher.TeacherProfile's identical split.
    """

    user = models.OneToOneField(
        "foundation.User", on_delete=models.CASCADE, db_column="user_id", related_name="student_profile"
    )
    branch = models.ForeignKey(
        "foundation.Branch", null=True, blank=True, on_delete=models.SET_NULL, db_column="branch_id"
    )
    student_code = models.CharField(max_length=50)
    status = models.CharField(max_length=20, choices=STUDENT_STATUS_CHOICES, default="pending")
    enrollment_date = models.DateField(default=timezone.localdate)
    graduation_date = models.DateField(null=True, blank=True)
    education_level = models.CharField(max_length=100, blank=True, null=True)
    school_name = models.CharField(max_length=255, blank=True, null=True)
    previous_institution = models.CharField(max_length=255, blank=True, null=True)
    medical_notes = models.TextField(blank=True, null=True)
    allergies = models.TextField(blank=True, null=True)
    blood_type = models.CharField(max_length=5, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    # Plain UUID stamps (not FKs), matching foundation.Branch's created_by/
    # updated_by precedent — audit trail only, never queried/joined against.
    created_by = models.UUIDField(null=True, blank=True)
    updated_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = schema_table("student", "student_profiles")
        constraints = [
            models.UniqueConstraint(fields=["organization", "student_code"], name="uq_student_profiles_org_code"),
            models.CheckConstraint(
                condition=models.Q(graduation_date__isnull=True) | models.Q(graduation_date__gte=models.F("enrollment_date")),
                name="chk_student_graduation",
            ),
        ]
        indexes = [
            models.Index(fields=["organization"], name="idx_student_profiles_org", condition=models.Q(deleted_at__isnull=True)),
            models.Index(
                fields=["organization", "status"], name="idx_student_profiles_status", condition=models.Q(deleted_at__isnull=True)
            ),
            models.Index(fields=["branch"], name="idx_student_profiles_branch", condition=models.Q(deleted_at__isnull=True)),
            models.Index(
                fields=["organization", "student_code"],
                name="idx_student_profiles_code",
                condition=models.Q(deleted_at__isnull=True),
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user.get_full_name()} ({self.student_code})"
