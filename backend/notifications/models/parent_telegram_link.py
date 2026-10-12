from django.db import models

from common.db import schema_table
from common.models import OrganizationScopedMixin, TimestampedMixin, UUIDPrimaryKeyMixin


class ParentTelegramLink(UUIDPrimaryKeyMixin, TimestampedMixin, OrganizationScopedMixin):
    """A parent's Telegram chat, verified the same way as auth_custom's
    TelegramAccount: the chat shared its own contact and the number matched
    `StudentParent.phone`. Parents usually have no Mentorio account, so this
    hangs off the StudentParent row rather than a User.

    One row per StudentParent: a parent with three children enrolled has
    three StudentParent rows (possibly in different centers), each linked
    to the same chat.
    """

    student_parent = models.OneToOneField(
        "student.StudentParent", on_delete=models.CASCADE, db_column="student_parent_id", related_name="telegram_link"
    )
    chat_id = models.BigIntegerField()
    telegram_user_id = models.BigIntegerField()
    username = models.CharField(max_length=64, blank=True, null=True)
    # The number the chat proved it owns. The link only counts while it
    # still matches StudentParent.phone (see telegram_links.is_current):
    # if an admin changes the parent's number, the old chat stops getting
    # the child's notifications without anyone having to remember to unlink.
    verified_phone = models.CharField(max_length=20, blank=True, default="")
    # Off after /stop in the bot, or when Telegram reports the bot blocked.
    active = models.BooleanField(default=True)

    class Meta:
        db_table = schema_table("notification", "parent_telegram_links")
        indexes = [
            models.Index(fields=["chat_id"], name="idx_parent_tg_links_chat"),
        ]
