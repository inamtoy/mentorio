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

    class Meta:
        db_table = schema_table("auth", "telegram_accounts")
        indexes = [
            models.Index(fields=["chat_id"], name="idx_telegram_accounts_chat"),
        ]
