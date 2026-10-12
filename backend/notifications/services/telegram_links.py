"""Linking Telegram chats for notifications, by Telegram-verified phone.

A chat proves it owns a number by sharing its OWN contact (the bot checks
contact.user_id == sender id before calling in here — the same proof the
password reset already trusts). Every active account and every parent
record carrying that number is then linked to the chat, across all
centers: one parent with children in two centers gets both.

Runs from the bot (no request, no org context), so all DB access goes
through BYPASS_ALIAS, as in auth_custom.services.password_reset_service.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from django.db import transaction

from auth_custom.models import TelegramAccount
from auth_custom.services.phone import digits_only, phone_key, phones_match
from auth_custom.services.session_service import BYPASS_ALIAS
from common.db import PhoneKey
from foundation.models import User
from notifications.models import ParentTelegramLink
from student.models import StudentParent


@dataclass
class LinkResult:
    users: list[str] = field(default_factory=list)  # full names
    children: list[str] = field(default_factory=list)  # children's full names, via parent records

    @property
    def linked_anything(self) -> bool:
        return bool(self.users or self.children)


def link_by_phone(*, chat_id: int, sender: dict, contact: dict) -> LinkResult:
    result = LinkResult()
    key = phone_key(contact.get("phone_number"))
    if key is None:
        return result

    username = (sender.get("username") or "")[:64] or None
    verified_phone = digits_only(contact.get("phone_number"))[:20]

    users = (
        User.objects.using(BYPASS_ALIAS)
        .annotate(phone_key=PhoneKey("phone"))
        .filter(phone_key=key, status="active")
    )
    parents = (
        StudentParent.objects.using(BYPASS_ALIAS)
        .annotate(phone_key=PhoneKey("phone"))
        .filter(phone_key=key, student_profile__deleted_at__isnull=True)
        .select_related("student_profile__user")
    )

    with transaction.atomic(using=BYPASS_ALIAS):
        for user in users:
            TelegramAccount.objects.using(BYPASS_ALIAS).update_or_create(
                user=user,
                defaults={
                    "organization_id": user.organization_id,
                    "chat_id": chat_id,
                    "telegram_user_id": sender["id"],
                    "username": username,
                    "verified_phone": verified_phone,
                    "notifications_enabled": True,
                },
            )
            result.users.append(user.get_full_name())

        for parent in parents:
            ParentTelegramLink.objects.using(BYPASS_ALIAS).update_or_create(
                student_parent=parent,
                defaults={
                    "organization_id": parent.organization_id,
                    "chat_id": chat_id,
                    "telegram_user_id": sender["id"],
                    "username": username,
                    "verified_phone": verified_phone,
                    "active": True,
                },
            )
            result.children.append(parent.student_profile.user.get_full_name())

    return result


def is_current(verified_phone: str | None, current_phone: str | None) -> bool:
    """A link proves the chat owned the number on file *when it linked*.
    Once the number on file changes, the link no longer says anything about
    who should get these messages, so it's treated as not connected until
    the new number's owner shares it."""
    return phones_match(verified_phone, current_phone)


def user_link_is_current(account) -> bool:
    return is_current(account.verified_phone, account.user.phone)


def parent_link_is_current(link) -> bool:
    return is_current(link.verified_phone, link.student_parent.phone)


def unlink_chat(chat_id: int) -> int:
    """/stop: switch off every notification link of this chat. Rows stay
    (verified links, no data deletion); sharing the contact again turns
    them back on. Returns how many links were switched off."""
    with transaction.atomic(using=BYPASS_ALIAS):
        users = TelegramAccount.objects.using(BYPASS_ALIAS).filter(
            chat_id=chat_id, notifications_enabled=True
        ).update(notifications_enabled=False)
        parents = ParentTelegramLink.objects.using(BYPASS_ALIAS).filter(chat_id=chat_id, active=True).update(
            active=False
        )
    return users + parents
