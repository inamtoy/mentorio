"""Draining the NotificationDelivery outbox — the only code that sends
notification messages to Telegram. Run by `manage.py send_notifications`.

Rows are claimed with a short lease instead of holding a transaction open
across network calls: a claim pushes `next_attempt_at` forward and counts
the attempt, so a second worker skips them, and a worker that dies mid-
batch only delays those rows until the lease runs out.

Runs outside any request (no org context): BYPASS_ALIAS throughout.
"""

from __future__ import annotations

import logging
import time
from datetime import timedelta

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from auth_custom.models import TelegramAccount
from auth_custom.services import telegram_client
from auth_custom.services.session_service import BYPASS_ALIAS
from notifications.models import NotificationDelivery, ParentTelegramLink

logger = logging.getLogger(__name__)

BATCH_SIZE = 50
LEASE = timedelta(minutes=5)
# Wait before attempt 2, 3, 4; after the 4th failed attempt the row is `failed`.
RETRY_DELAYS = [timedelta(minutes=1), timedelta(minutes=5), timedelta(minutes=30)]
MAX_ATTEMPTS = len(RETRY_DELAYS) + 1
# Telegram allows ~30 messages/second per bot; stay under it.
SEND_INTERVAL_SECONDS = 1 / 25


def send_pending(*, batch_size: int = BATCH_SIZE, sleep=time.sleep) -> int:
    """Send one batch of due deliveries. Returns how many were claimed
    (0 means the outbox is empty for now)."""
    rows = _claim(batch_size)
    for index, row in enumerate(rows):
        if index:
            sleep(SEND_INTERVAL_SECONDS)
        _send_one(row)
    return len(rows)


def _claim(batch_size: int) -> list[NotificationDelivery]:
    now = timezone.now()
    with transaction.atomic(using=BYPASS_ALIAS):
        ids = list(
            NotificationDelivery.objects.using(BYPASS_ALIAS)
            .select_for_update(skip_locked=True)
            .filter(status="pending", next_attempt_at__lte=now)
            .order_by("next_attempt_at")
            .values_list("id", flat=True)[:batch_size]
        )
        if not ids:
            return []
        NotificationDelivery.objects.using(BYPASS_ALIAS).filter(id__in=ids).update(
            attempts=F("attempts") + 1, next_attempt_at=now + LEASE
        )
    return list(NotificationDelivery.objects.using(BYPASS_ALIAS).filter(id__in=ids).order_by("next_attempt_at"))


def _send_one(row: NotificationDelivery) -> None:
    try:
        telegram_client.send_message(row.chat_id, row.text)
    except telegram_client.TelegramError as exc:
        _record_failure(row, exc)
        return
    NotificationDelivery.objects.using(BYPASS_ALIAS).filter(pk=row.pk).update(
        status="sent", sent_at=timezone.now(), last_error=""
    )


def _record_failure(row: NotificationDelivery, exc: telegram_client.TelegramError) -> None:
    error = str(exc)[:500]
    deliveries = NotificationDelivery.objects.using(BYPASS_ALIAS).filter(pk=row.pk)

    if exc.status == 403:
        # Blocked the bot or deleted their account: retrying can't help,
        # and every future message to this chat would fail the same way.
        deliveries.update(status="failed", last_error=error)
        _deactivate_chat(row.chat_id)
        logger.info("Telegram chat %s is unreachable (403); its notification links were switched off", row.chat_id)
        return

    if row.attempts >= MAX_ATTEMPTS:
        deliveries.update(status="failed", last_error=error)
        logger.warning("Notification delivery %s failed for good: %s", row.pk, error)
        return

    delay = RETRY_DELAYS[row.attempts - 1]
    if exc.status == 429 and exc.retry_after:
        delay = max(delay, timedelta(seconds=exc.retry_after))
    deliveries.update(next_attempt_at=timezone.now() + delay, last_error=error)


def _deactivate_chat(chat_id: int) -> None:
    with transaction.atomic(using=BYPASS_ALIAS):
        TelegramAccount.objects.using(BYPASS_ALIAS).filter(chat_id=chat_id).update(notifications_enabled=False)
        ParentTelegramLink.objects.using(BYPASS_ALIAS).filter(chat_id=chat_id).update(active=False)
        # Anything else already queued for this chat would only fail too.
        NotificationDelivery.objects.using(BYPASS_ALIAS).filter(chat_id=chat_id, status="pending").update(
            status="failed", last_error="Chat unreachable (bot blocked)."
        )
