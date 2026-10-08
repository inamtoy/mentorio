"""Local-dev transport for the Telegram bot: long-polls getUpdates and feeds
each update to the same handler the production webhook uses
(auth_custom.views.TelegramWebhookView). Telegram allows only one transport
at a time, so this removes any registered webhook first — never run it
against the production bot.

    python manage.py run_telegram_bot
"""

import logging
import time

from django.core.management.base import BaseCommand, CommandError

from auth_custom.services import password_reset_service, telegram_client

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Long-poll the Telegram bot (local development only; production uses the webhook)."

    def handle(self, *args, **options):
        if not telegram_client.is_configured():
            raise CommandError("Set TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME in backend/.env first.")

        telegram_client.delete_webhook()
        self.stdout.write(self.style.SUCCESS("Polling Telegram for updates — Ctrl+C to stop."))

        offset = None
        while True:
            try:
                updates = telegram_client.get_updates(offset)
            except telegram_client.TelegramError as exc:
                self.stderr.write(f"getUpdates failed, retrying in 5s: {exc}")
                time.sleep(5)
                continue
            except KeyboardInterrupt:
                return

            for update in updates:
                offset = update["update_id"] + 1
                try:
                    password_reset_service.handle_update(update)
                except Exception:  # noqa: BLE001 — one bad update must not stop the bot
                    logger.exception("Telegram update %s failed", update.get("update_id"))
