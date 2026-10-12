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
    pass


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
        try:
            description = json.loads(exc.read()).get("description", str(exc))
        except (ValueError, AttributeError):
            description = str(exc)
        raise TelegramError(f"{method} failed: {description}") from None
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
