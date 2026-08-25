from django.db import models

from common.db import schema_table
from common.models import TimestampedMixin, UUIDPrimaryKeyMixin


class ApiKey(UUIDPrimaryKeyMixin, TimestampedMixin):
    """Platform-level API keys — Super-Admin Settings' API Keys panel. The
    raw secret is never stored (`foundation.services.generate_api_key` only
    ever returns it once, at creation time) — only a SHA-256 `key_hash` for
    verification and a `key_prefix` (first 12 chars of the raw key) so the
    UI can show *which* key a row is without being able to reveal it again,
    the same "shown once" UX as GitHub personal access tokens.

    `revoked_at`, not `SoftDeleteMixin` — revocation is a distinct concept
    from deletion here (a revoked key is still real history, same reason
    `Role.is_active` is a flag rather than a soft-delete).

    Platform-global like `Permission`/`PlatformBackup` — no `organization`
    FK, deliberately left out of `RLS_TABLES`, gated by the
    `platform_settings` permission check in the view.
    """

    name = models.CharField(max_length=255)
    key_prefix = models.CharField(max_length=20)
    key_hash = models.CharField(max_length=64)
    created_by = models.ForeignKey(
        "foundation.User", on_delete=models.SET_NULL, null=True, related_name="created_api_keys"
    )
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = schema_table("foundation", "api_keys")
        indexes = [
            models.Index(fields=["key_hash"], name="idx_api_keys_hash"),
            models.Index(fields=["-created_at"], name="idx_api_keys_created"),
        ]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.name
