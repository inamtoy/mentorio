"""Production: point the bot at TelegramWebhookView.

    python manage.py set_telegram_webhook https://api.example.uz/api/v1/auth/telegram/webhook/
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from auth_custom.services import telegram_client


class Command(BaseCommand):
    help = "Register the production webhook URL (with TELEGRAM_WEBHOOK_SECRET) for the Telegram bot."

    def add_arguments(self, parser):
        parser.add_argument("url", help="Public HTTPS URL of /api/v1/auth/telegram/webhook/")

    def handle(self, *args, url, **options):
        if not url.startswith("https://"):
            raise CommandError("Telegram only delivers webhooks to https:// URLs.")
        if not settings.TELEGRAM_WEBHOOK_SECRET:
            raise CommandError("Set TELEGRAM_WEBHOOK_SECRET first — without it the webhook would reject every update.")
        telegram_client.set_webhook(url, settings.TELEGRAM_WEBHOOK_SECRET)
        self.stdout.write(self.style.SUCCESS(f"Webhook set to {url}"))
