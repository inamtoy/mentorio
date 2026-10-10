from django.db import models
from django.utils import timezone

from common.db import schema_table
from common.models import OrganizationScopedMixin, SoftDeleteMixin, TimestampedMixin, UUIDPrimaryKeyMixin

TEACHER_STATUS_CHOICES = [
    ("active", "Active"),
    ("inactive", "Inactive"),
    ("on_leave", "On Leave"),
    ("terminated", "Terminated"),
    ("pending", "Pending"),
]

EMPLOYMENT_TYPE_CHOICES = [
    ("full_time", "Full Time"),
    ("part_time", "Part Time"),
    ("contract", "Contract"),
    ("freelance", "Freelance"),
    ("intern", "Intern"),
]


class TeacherProfile(UUIDPrimaryKeyMixin, TimestampedMixin, SoftDeleteMixin, OrganizationScopedMixin):
    """Extended teacher-specific data, 1:1 with foundation.User — mirrors
    student.StudentProfile's split of role-specific fields off the
    universal user record."""

    user = models.OneToOneField(
        "foundation.User", on_delete=models.CASCADE, db_column="user_id", related_name="teacher_profile"
    )
    branch = models.ForeignKey(
        "foundation.Branch", null=True, blank=True, on_delete=models.SET_NULL, db_column="branch_id"
    )
    teacher_code = models.CharField(max_length=50)
    status = models.CharField(max_length=20, choices=TEACHER_STATUS_CHOICES, default="pending")
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_TYPE_CHOICES, default="full_time")
    hire_date = models.DateField(default=timezone.localdate)
    termination_date = models.DateField(null=True, blank=True)
    bio = models.TextField(blank=True, null=True)
    experience_years = models.SmallIntegerField(default=0)
    education_degree = models.CharField(max_length=100, blank=True, null=True)
    university = models.CharField(max_length=255, blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_by = models.UUIDField(null=True, blank=True)
    updated_by = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = schema_table("teacher", "teacher_profiles")
        constraints = [
            models.UniqueConstraint(fields=["organization", "teacher_code"], name="uq_teacher_profiles_org_code"),
            models.CheckConstraint(
                condition=models.Q(termination_date__isnull=True) | models.Q(termination_date__gte=models.F("hire_date")),
                name="chk_teacher_termination",
            ),
            models.CheckConstraint(
                condition=models.Q(experience_years__gte=0) & models.Q(experience_years__lte=60),
                name="chk_teacher_experience",
            ),
        ]
        indexes = [
            models.Index(fields=["organization"], name="idx_teacher_profiles_org", condition=models.Q(deleted_at__isnull=True)),
            models.Index(
                fields=["organization", "status"], name="idx_teacher_profiles_status", condition=models.Q(deleted_at__isnull=True)
            ),
            models.Index(fields=["branch"], name="idx_teacher_profiles_branch", condition=models.Q(deleted_at__isnull=True)),
        ]

    def __str__(self) -> str:
        return f"{self.user.get_full_name()} ({self.teacher_code})"
