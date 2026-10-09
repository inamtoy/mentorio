"""Minimal Telegram Bot API client — stdlib only (urllib), since the four
calls this app makes don't justify a new dependency.

Never log the token: it's embedded in every request URL.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org"


class TelegramError(Exception):
    """`status` is Telegram's HTTP error code when there was one (403: the
    user blocked the bot; 429: rate limited, `retry_after` seconds), None
    for network failures."""

    def __init__(self, message: str, *, status: int | None = None, retry_after: int | None = None):
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after


def is_configured() -> bool:
    return bool(settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_BOT_USERNAME)


def _call(method: str, payload: dict | None = None, *, timeout: float = 10) -> dict | list | bool:
    if not settings.TELEGRAM_BOT_TOKEN:
        raise TelegramError("TELEGRAM_BOT_TOKEN is not configured.")
    request = urllib.request.Request(
        f"{API_BASE}/bot{settings.TELEGRAM_BOT_TOKEN}/{method}",
        data=json.dumps(payload or {}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        retry_after = None
        try:
            error_body = json.loads(exc.read())
            description = error_body.get("description", str(exc))
            retry_after = (error_body.get("parameters") or {}).get("retry_after")
        except (ValueError, AttributeError):
            description = str(exc)
        raise TelegramError(f"{method} failed: {description}", status=exc.code, retry_after=retry_after) from None
    except (urllib.error.URLError, TimeoutError) as exc:
        raise TelegramError(f"{method} failed: {exc}") from None

    if not body.get("ok"):
        raise TelegramError(f"{method} failed: {body.get('description', 'unknown error')}")
    return body["result"]


def send_message(chat_id: int, text: str, *, reply_markup: dict | None = None) -> None:
    payload: dict = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    _call("sendMessage", payload)


def send_quietly(chat_id: int | None, text: str, *, reply_markup: dict | None = None) -> None:
    """For replies sent inline with other work (bot replies, security
    notices): a Telegram outage must never fail the HTTP request or the DB
    work around it — log and move on. Notifications don't use this: they
    go through the retrying outbox (notifications.services.delivery)."""
    if not chat_id:
        return
    try:
        send_message(chat_id, text, reply_markup=reply_markup)
    except TelegramError:
        logger.warning("Telegram sendMessage failed for chat %s", chat_id, exc_info=True)


def get_updates(offset: int | None, *, timeout: int = 25) -> list[dict]:
    payload: dict = {"timeout": timeout, "allowed_updates": ["message"]}
    if offset is not None:
        payload["offset"] = offset
    return _call("getUpdates", payload, timeout=timeout + 10)


def delete_webhook() -> None:
    _call("deleteWebhook", {"drop_pending_updates": False})


def set_webhook(url: str, secret_token: str) -> None:
    _call("setWebhook", {"url": url, "secret_token": secret_token, "allowed_updates": ["message"]})


def deep_link(start_param: str) -> str:
    return f"https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start={start_param}"
