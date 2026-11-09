from django.db import models

from common.db import schema_table
from common.models import CreatedAtMixin, UUIDPrimaryKeyMixin

LOGIN_STATUS_CHOICES = [
    ("success", "Success"),
    ("failed", "Failed"),
    ("blocked", "Blocked"),
]


class LoginAttempt(UUIDPrimaryKeyMixin, CreatedAtMixin):
    """Every login attempt, for brute-force detection and audit. Immutable —
    rate limiting reads recent rows, doesn't mutate them. Kept 30 days, then
    hard-deleted by `manage.py cleanup_login_attempts` (daily cron).
    """

    organization = models.ForeignKey(
        "foundation.Organization", null=True, blank=True, on_delete=models.SET_NULL, db_column="organization_id"
    )
    user = models.ForeignKey(
        "foundation.User", null=True, blank=True, on_delete=models.SET_NULL, db_column="user_id"
    )
    login_id = models.CharField(max_length=32, blank=True, null=True)
    status = models.CharField(max_length=10, choices=LOGIN_STATUS_CHOICES)
    ip_address = models.GenericIPAddressField()
    user_agent = models.TextField(blank=True, null=True)
    failure_reason = models.CharField(max_length=100, blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = schema_table("auth", "login_attempts")
        indexes = [
            models.Index(fields=["user", "-created_at"], name="idx_login_attempts_user"),
            models.Index(fields=["ip_address", "-created_at"], name="idx_login_attempts_ip"),
            models.Index(fields=["organization", "-created_at"], name="idx_login_attempts_org"),
            models.Index(fields=["login_id", "-created_at"], name="idx_login_attempts_login_id"),
        ]
