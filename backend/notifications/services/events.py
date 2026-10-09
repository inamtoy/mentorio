"""System-generated notifications for domain events.

Every event fans out to:
- the student's in-app inbox (a Notification row), and
- Telegram, through the NotificationDelivery outbox: the student's own
  linked chat (if notifications are on) and every linked parent chat.

Call these from inside the transaction that made the change: the inbox row
and the outbox rows commit or roll back with it. Nothing here touches the
network — `manage.py send_notifications` does the sending.

Idempotent per (event, object, recipient): the Notification's `event_key`
and the delivery's `dedupe_key` are unique, so marking a student absent
twice, or the daily reminder job running twice, notifies once.
"""

from __future__ import annotations

import html
from collections.abc import Callable

from django.db import DEFAULT_DB_ALIAS, transaction
from django.utils import timezone

from auth_custom.models import TelegramAccount
from notifications.models import Notification, NotificationDelivery, ParentTelegramLink
from notifications.services import messages
from notifications.services.messages import Text
from notifications.services.telegram_links import parent_link_is_current, user_link_is_current

# (language, for_parent) -> Text
Renderer = Callable[[str | None, bool], Text]


def notify_student(
    student_profile,
    *,
    event: str,
    object_id,
    render: Renderer,
    type: str = "info",
    category: str = "",
    using: str = DEFAULT_DB_ALIAS,
) -> Notification | None:
    """Returns the new inbox Notification, or None when this event was
    already delivered to this student."""
    user = student_profile.user
    event_key = f"{event}:{object_id}"
    now = timezone.now()

    with transaction.atomic(using=using):
        own = render(user.language, False)
        # all_objects: a notification the student deleted still counts as
        # delivered — re-sending it would be the bug, not a feature.
        notification, created = Notification.all_objects.using(using).get_or_create(
            recipient=user,
            event_key=event_key,
            defaults={
                "organization_id": student_profile.organization_id,
                "title": own.title,
                "message": own.body,
                "type": type,
                "category": category,
            },
        )
        if not created:
            return None

        deliveries = []
        chats_seen: set[int] = set()

        account = (
            TelegramAccount.objects.using(using)
            .filter(user=user, notifications_enabled=True)
            .select_related("user")
            .first()
        )
        if account is not None and user_link_is_current(account):
            chats_seen.add(account.chat_id)
            deliveries.append(
                NotificationDelivery(
                    organization_id=student_profile.organization_id,
                    notification=notification,
                    recipient_user=user,
                    event=event,
                    chat_id=account.chat_id,
                    text=_telegram_text(own),
                    next_attempt_at=now,
                    dedupe_key=f"{event_key}:user:{user.pk}",
                )
            )

        parent_links = (
            ParentTelegramLink.objects.using(using)
            .filter(
                student_parent__student_profile=student_profile,
                student_parent__deleted_at__isnull=True,
                active=True,
            )
            .select_related("student_parent")
            .order_by("created_at")
        )
        parent_text = None
        for link in parent_links:
            # A student registered with a parent's number shares the chat:
            # one message per chat, not one per role.
            if link.chat_id in chats_seen or not parent_link_is_current(link):
                continue
            chats_seen.add(link.chat_id)
            parent_text = parent_text or _telegram_text(render(messages.DEFAULT_LANGUAGE, True))
            deliveries.append(
                NotificationDelivery(
                    organization_id=student_profile.organization_id,
                    student_parent_id=link.student_parent_id,
                    event=event,
                    chat_id=link.chat_id,
                    text=parent_text,
                    next_attempt_at=now,
                    dedupe_key=f"{event_key}:parent:{link.student_parent_id}",
                )
            )

        NotificationDelivery.objects.using(using).bulk_create(deliveries, ignore_conflicts=True)

    return notification


def _telegram_text(text: Text) -> str:
    # send_message uses parse_mode=HTML — names and group titles are user input.
    return f"<b>{html.escape(text.title)}</b>\n{html.escape(text.body)}"


# ─── The three v1 events ──────────────────────────────────────────────────────


def _invoice_label(invoice) -> str:
    return invoice.group.name if invoice.group_id else invoice.invoice_number


def invoice_issued(invoice, *, using: str = DEFAULT_DB_ALIAS) -> Notification | None:
    if invoice.status == "draft":
        return None
    student = invoice.student_profile.user.get_full_name()
    group = _invoice_label(invoice)
    amount = messages.format_amount(invoice.total_amount, invoice.currency)
    due = messages.format_date(invoice.due_date)
    return notify_student(
        invoice.student_profile,
        event="invoice_issued",
        object_id=invoice.pk,
        render=lambda lang, for_parent: messages.invoice_issued(
            lang, for_parent=for_parent, student=student, group=group, amount=amount, due=due
        ),
        category="payment",
        using=using,
    )


def invoice_due_soon(invoice, *, balance, using: str = DEFAULT_DB_ALIAS) -> Notification | None:
    student = invoice.student_profile.user.get_full_name()
    group = _invoice_label(invoice)
    amount = messages.format_amount(balance, invoice.currency)
    due = messages.format_date(invoice.due_date)
    return notify_student(
        invoice.student_profile,
        event="invoice_due_soon",
        object_id=invoice.pk,
        render=lambda lang, for_parent: messages.invoice_due_soon(
            lang, for_parent=for_parent, student=student, group=group, amount=amount, due=due
        ),
        type="warning",
        category="payment",
        using=using,
    )


def student_absent(attendance, *, using: str = DEFAULT_DB_ALIAS) -> Notification | None:
    student = attendance.student_profile.user.get_full_name()
    group = attendance.group.name
    date = messages.format_date(attendance.date)
    return notify_student(
        attendance.student_profile,
        event="student_absent",
        object_id=attendance.pk,
        render=lambda lang, for_parent: messages.student_absent(
            lang, for_parent=for_parent, student=student, group=group, date=date
        ),
        type="warning",
        category="attendance",
        using=using,
    )
