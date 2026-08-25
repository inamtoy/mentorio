from django.db import models

from common.db import schema_table
from common.models import TimestampedMixin, UUIDPrimaryKeyMixin

PLATFORM_BACKUP_STATUS_CHOICES = [
    ("pending", "Pending"),
    ("running", "Running"),
    ("success", "Success"),
    ("failed", "Failed"),
]


class PlatformBackup(UUIDPrimaryKeyMixin, TimestampedMixin):
    """One row per manual/automated DB backup run — Super-Admin Settings'
    Backup panel. Platform-global like `Permission`, not `Organization`-
    scoped (a database dump isn't tenant data, it's the whole platform's),
    so it's deliberately left out of `RLS_TABLES`
    (foundation/migrations/0004_rls.py) — same precedent as `Permission` —
    and gated purely by the `platform_settings` permission check in the
    view, which only `super_admin` ever holds (see
    migrations/0011_seed_platform_settings_permission.py).
    """

    status = models.CharField(max_length=20, choices=PLATFORM_BACKUP_STATUS_CHOICES, default="pending")
    triggered_by = models.ForeignKey(
        "foundation.User", on_delete=models.SET_NULL, null=True, related_name="triggered_backups"
    )
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    size_bytes = models.BigIntegerField(null=True, blank=True)
    storage_path = models.TextField(blank=True, null=True)
    error_message = models.TextField(blank=True, null=True)

    class Meta:
        db_table = schema_table("foundation", "platform_backups")
        indexes = [
            models.Index(fields=["-created_at"], name="idx_platform_backups_created"),
        ]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Backup {self.id} ({self.status})"
