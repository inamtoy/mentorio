from django.db import models

from common.db import schema_table
from common.models import TimestampedMixin, UUIDPrimaryKeyMixin


class TelegramAccount(UUIDPrimaryKeyMixin, TimestampedMixin):
    """A user's verified Telegram chat — written only after that chat shared
    a contact (Telegram-verified phone) matching the user's own phone, so
    it's safe to message security notices and, later, notifications here.

    One per user. NOT unique on chat_id: a parent's single Telegram account
    legitimately belongs to every child's Mentorio account that lists the
    parent's phone.
    """

    user = models.OneToOneField("foundation.User", on_delete=models.CASCADE, related_name="telegram_account")
    organization = models.ForeignKey("foundation.Organization", on_delete=models.CASCADE, db_column="organization_id")
    chat_id = models.BigIntegerField()
    telegram_user_id = models.BigIntegerField()
    username = models.CharField(max_length=64, blank=True, null=True)
    verified_phone = models.CharField(max_length=20)
    # The user's own on/off switch for notification messages (Settings ->
    # Notifications, or /stop in the bot). Security notices from the reset
    # flow ignore it. Turning it off keeps the row: the chat is still a
    # verified link, and turning it back on needs no re-verification.
    notifications_enabled = models.BooleanField(default=True)

    class Meta:
        db_table = schema_table("auth", "telegram_accounts")
        indexes = [
            models.Index(fields=["chat_id"], name="idx_telegram_accounts_chat"),
        ]


CHAT_INTENT_CHOICES = [
    ("reset", "Password reset"),
    ("connect", "Connect notifications"),
]


class TelegramChatState(models.Model):
    """What a chat last asked the bot for, so a shared contact can be routed
    to the right flow. A contact message carries no context of its own.

    It has to be stored even when the /start token matched nothing: a
    contact after an unknown reset link must get the same reply as a phone
    mismatch (no login_id enumeration — see password_reset_service), not
    fall through to "notifications connected".

    Keyed by chat, no organization: a chat isn't tenant data until a
    contact is matched, and it's only ever touched through BYPASS_ALIAS.
    """

    chat_id = models.BigIntegerField(primary_key=True)
    intent = models.CharField(max_length=20, choices=CHAT_INTENT_CHOICES)
    intent_at = models.DateTimeField()

    class Meta:
        db_table = schema_table("auth", "telegram_chat_states")
