"""Sends queued notification messages (the NotificationDelivery outbox).

    python manage.py send_notifications          # one pass, then exit (cron)
    python manage.py send_notifications --loop   # keep running (dev, or a service)

Safe to run several at once: rows are claimed with SKIP LOCKED.
"""

import logging
import time

from django.core.management.base import BaseCommand, CommandError

from auth_custom.services import telegram_client
from notifications.services import delivery

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Send pending notification messages to Telegram."

    def add_arguments(self, parser):
        parser.add_argument("--loop", action="store_true", help="Keep polling the outbox instead of exiting.")
        parser.add_argument(
            "--interval", type=float, default=3.0, help="Seconds to wait when the outbox is empty (with --loop)."
        )

    def handle(self, *args, **options):
        if not telegram_client.is_configured():
            raise CommandError("Set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME in backend/.env first.")

        if not options["loop"]:
            total = 0
            while claimed := delivery.send_pending():
                total += claimed
            self.stdout.write(f"Processed {total} deliveries.")
            return

        self.stdout.write(self.style.SUCCESS("Sending notifications — Ctrl+C to stop."))
        while True:
            try:
                claimed = delivery.send_pending()
            except KeyboardInterrupt:
                return
            except Exception:  # noqa: BLE001 — a DB hiccup must not kill the worker
                logger.exception("Notification batch failed; retrying")
                claimed = 0
            if not claimed:
                try:
                    time.sleep(options["interval"])
                except KeyboardInterrupt:
                    return
