from django.db import models

from common.db import PhoneKey, schema_table
from common.models import OrganizationScopedMixin, SoftDeleteMixin, TimestampedMixin, UUIDPrimaryKeyMixin

PARENT_RELATION_CHOICES = [
    ("father", "Father"),
    ("mother", "Mother"),
    ("guardian", "Guardian"),
    ("sibling", "Sibling"),
    ("grandparent", "Grandparent"),
    ("other", "Other"),
]


class StudentParent(UUIDPrimaryKeyMixin, TimestampedMixin, SoftDeleteMixin, OrganizationScopedMixin):
    """Parent/guardian contact for a student — optionally linked to their
    own foundation.User row if they have parent-portal access.
    """

    student_profile = models.ForeignKey(
        "student.StudentProfile", on_delete=models.CASCADE, db_column="student_profile_id", related_name="parents"
    )
    user = models.ForeignKey(
        "foundation.User", null=True, blank=True, on_delete=models.SET_NULL, db_column="user_id", related_name="+"
    )
    relation = models.CharField(max_length=20, choices=PARENT_RELATION_CHOICES)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.CharField(max_length=255, blank=True, null=True)
    workplace = models.CharField(max_length=255, blank=True, null=True)
    occupation = models.CharField(max_length=100, blank=True, null=True)
    is_primary_contact = models.BooleanField(default=False)
    can_pickup = models.BooleanField(default=True)
    notes = models.TextField(blank=True, null=True)

    class Meta:
        db_table = schema_table("student", "student_parents")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(phone__isnull=False) | models.Q(email__isnull=False),
                name="chk_parent_contact",
            ),
        ]
        indexes = [
            models.Index(
                fields=["student_profile"], name="idx_student_parents_student", condition=models.Q(deleted_at__isnull=True)
            ),
            models.Index(fields=["organization"], name="idx_student_parents_org", condition=models.Q(deleted_at__isnull=True)),
            # See foundation.User's idx_users_phone_key — same lookup, for parents.
            models.Index(
                PhoneKey("phone"), name="idx_student_parents_phone_key", condition=models.Q(deleted_at__isnull=True)
            ),
        ]

    def __str__(self) -> str:
        return f"{self.first_name} {self.last_name} ({self.relation})"
