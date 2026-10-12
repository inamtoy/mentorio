from django.db import models

from common.db import schema_table
from common.models import CreatedAtMixin, UUIDPrimaryKeyMixin

RESET_CHANNEL_CHOICES = [
    ("telegram", "Telegram"),
]


class PasswordReset(UUIDPrimaryKeyMixin, CreatedAtMixin):
    """One self-service "forgot password" request. Only the latest request
    per user is valid — starting a new one expires the older ones (enforced
    in auth_custom/services/password_reset_service.py, not by a DB
    constraint).

    Telegram flow: `token_hash` identifies the request (its raw value rides
    in the bot deep link and stays in the browser), `telegram_chat_id` binds
    it to the chat that pressed /start, and `code_hash` is only set once
    that chat has shared a contact whose phone matches the user's.
    """

    user = models.ForeignKey("foundation.User", on_delete=models.CASCADE, related_name="password_resets")
    organization = models.ForeignKey("foundation.Organization", on_delete=models.CASCADE, db_column="organization_id")
    token_hash = models.CharField(max_length=255, unique=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    channel = models.CharField(max_length=20, choices=RESET_CHANNEL_CHOICES, default="telegram")
    telegram_chat_id = models.BigIntegerField(null=True, blank=True)
    code_hash = models.CharField(max_length=255, null=True, blank=True)
    codes_sent = models.SmallIntegerField(default=0)
    attempts = models.SmallIntegerField(default=0)

    class Meta:
        db_table = schema_table("auth", "password_resets")
        constraints = [
            models.CheckConstraint(
                condition=models.Q(expires_at__gt=models.F("created_at")), name="chk_password_resets_expiry"
            ),
        ]
        indexes = [
            models.Index(fields=["user", "-created_at"], name="idx_password_resets_user"),
            models.Index(
                fields=["token_hash"], name="idx_password_resets_token", condition=models.Q(used_at__isnull=True)
            ),
            models.Index(
                fields=["telegram_chat_id", "-created_at"],
                name="idx_password_resets_tg_chat",
                condition=models.Q(used_at__isnull=True, telegram_chat_id__isnull=False),
            ),
        ]
