"""Self-service password reset, proven through a Telegram-verified phone.

    browser                         bot                          backend
    ───────                         ───                          ───────
    POST /password-reset/start  ─────────────────────────────▶  PasswordReset(token_hash)
      ◀── bot deep link (?start=<raw token>)
    opens link ──────────────▶  /start <token>  ─────────────▶  binds telegram_chat_id
                                shares own contact ──────────▶  phone == user.phone ?
                                ◀── 6-digit code  ◀──────────  code_hash stored
    POST /password-reset/confirm (token, code, new password) ─▶  password set,
                                                                 every session ended

Everything here runs before any org context exists (the browser is anonymous,
the bot update has no user), so all DB access goes through BYPASS_ALIAS —
same as LoginView.

Enumeration: start() answers identically whether or not the login_id exists
(an unknown one just gets a link no row matches), and the bot replies to a
dead link with the same message as a phone mismatch.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import Throttled, ValidationError

from auth_custom.models import PasswordReset, TelegramAccount
from auth_custom.services import telegram_client
from auth_custom.services.phone import digits_only, phones_match
from auth_custom.services.session_service import BYPASS_ALIAS, hash_token, revoke_all_user_sessions
from foundation.models import User

# Shared by start() for real and fake requests alike, and reused by the
# confirm step for every failure mode, so neither leaks which case it hit.
INVALID_CODE_MESSAGE = "The code is incorrect or has expired. Start the reset again if needed."


# ─── Bot copy (Uzbek — the bot speaks to every center's users) ───────────────

MSG_SHARE_CONTACT = (
    "🔐 <b>Mentorio: parolni tiklash</b>\n\n"
    "Shaxsingizni tasdiqlash uchun pastdagi <b>«📱 Raqamni yuborish»</b> tugmasini bosing. "
    "Raqamingiz Mentorio profilingizdagi raqam bilan solishtiriladi."
)
MSG_NOT_VERIFIED = (
    "❌ Raqamni tasdiqlab bo'lmadi.\n\n"
    "Sabablari:\n"
    "• havola eskirgan (15 daqiqa amal qiladi);\n"
    "• Telegram raqamingiz Mentorio profilingizdagi raqamdan farq qiladi.\n\n"
    "Saytda qaytadan urinib ko'ring yoki markaz administratoriga murojaat qiling."
)
MSG_TOO_MANY_CODES = "Kod juda ko'p marta so'raldi. Saytda parolni tiklashni qaytadan boshlang."
MSG_CODE = (
    "Tasdiqlash kodi: <b>{code}</b>\n\n"
    "Kodni Mentorio saytidagi oynaga kiriting. Kod 15 daqiqa amal qiladi.\n"
    "Kodni hech kimga bermang — Mentorio xodimlari uni hech qachon so'ramaydi."
)
MSG_PASSWORD_CHANGED = (
    "✅ Mentorio parolingiz o'zgartirildi va barcha qurilmalardagi seanslar yopildi.\n\n"
    "Agar buni siz qilmagan bo'lsangiz, darhol markaz administratoriga murojaat qiling."
)

SHARE_CONTACT_KEYBOARD = {
    "keyboard": [[{"text": "📱 Raqamni yuborish", "request_contact": True}]],
    "resize_keyboard": True,
    "one_time_keyboard": True,
}
REMOVE_KEYBOARD = {"remove_keyboard": True}


# ─── Browser side ─────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class StartedReset:
    token: str
    bot_url: str
    expires_in_seconds: int


def start_reset(*, login_id: str, ip_address: str | None) -> StartedReset:
    lifetime: timedelta = settings.PASSWORD_RESET_TOKEN_LIFETIME
    raw_token = secrets.token_urlsafe(32)
    now = timezone.now()

    user = (
        User.objects.using(BYPASS_ALIAS)
        .filter(login_id=login_id.strip(), status="active")
        .first()
    )
    if user is not None:
        _enforce_request_limit(user, now)
        with transaction.atomic(using=BYPASS_ALIAS):
            # Only the newest request stays valid.
            PasswordReset.objects.using(BYPASS_ALIAS).filter(
                user=user, used_at__isnull=True, expires_at__gt=now
            ).update(expires_at=now)
            PasswordReset.objects.using(BYPASS_ALIAS).create(
                user=user,
                organization_id=user.organization_id,
                token_hash=hash_token(raw_token),
                ip_address=ip_address,
                expires_at=now + lifetime,
            )

    return StartedReset(
        token=raw_token,
        bot_url=telegram_client.deep_link(raw_token),
        expires_in_seconds=int(lifetime.total_seconds()),
    )


def _enforce_request_limit(user, now) -> None:
    recent = PasswordReset.objects.using(BYPASS_ALIAS).filter(
        user=user, created_at__gte=now - timedelta(hours=1)
    ).count()
    if recent >= settings.PASSWORD_RESET_MAX_REQUESTS_PER_HOUR:
        raise Throttled(detail="Too many password reset requests. Please try again in an hour.")


def confirm_reset(*, token: str, code: str, new_password: str, request) -> User:
    """Raises ValidationError (400) on any bad token/code — one shared
    message for all of them. A correct code with a password that fails the
    policy raises the policy's own error WITHOUT consuming the attempt, so
    the user can just pick a stronger password."""
    from common.audit import audit_log
    from foundation.password_policy import validate_password_policy

    now = timezone.now()
    with transaction.atomic(using=BYPASS_ALIAS):
        reset = (
            PasswordReset.objects.using(BYPASS_ALIAS)
            .select_for_update()
            .filter(token_hash=hash_token(token), used_at__isnull=True, expires_at__gt=now)
            .first()
        )
        if reset is None or not reset.code_hash or reset.attempts >= settings.PASSWORD_RESET_MAX_CODE_ATTEMPTS:
            raise ValidationError({"code": [INVALID_CODE_MESSAGE]})

        code_ok = hmac.compare_digest(reset.code_hash, _hash_code(reset, code.strip()))
        if not code_ok:
            # Saved inside the block and raised after it, so the burned
            # attempt commits even though the request fails.
            reset.attempts += 1
            reset.save(using=BYPASS_ALIAS, update_fields=["attempts"])

    if not code_ok:
        raise ValidationError({"code": [INVALID_CODE_MESSAGE]})

    validate_password_policy(new_password, using=BYPASS_ALIAS)

    with transaction.atomic(using=BYPASS_ALIAS):
        user = User.objects.using(BYPASS_ALIAS).select_for_update().get(pk=reset.user_id)
        user.set_password(new_password)
        user.must_change_password = False
        user.save(using=BYPASS_ALIAS, update_fields=["password", "must_change_password"])

        PasswordReset.objects.using(BYPASS_ALIAS).filter(pk=reset.pk).update(used_at=now)
        revoke_all_user_sessions(user, reason="password_reset", using=BYPASS_ALIAS)
        audit_log(
            request,
            action="update",
            entity_type="user",
            entity_id=str(user.id),
            user=user,
            using=BYPASS_ALIAS,
            metadata={"field": "password", "via": "telegram_reset"},
        )

    telegram_client.send_quietly(reset.telegram_chat_id, MSG_PASSWORD_CHANGED)
    return user


# ─── Bot side ─────────────────────────────────────────────────────────────────


# Updates reach these two through auth_custom.services.telegram_bot, which
# owns routing (and the own-contact check) for every flow the bot serves.


def bind_chat(chat_id: int, token: str) -> None:
    """`/start <token>` from the reset deep link: bind the request to this
    chat and ask for the contact. An unknown/expired token silently binds
    nothing — the reply is the same either way, see the module docstring."""
    PasswordReset.objects.using(BYPASS_ALIAS).filter(
        token_hash=hash_token(token),
        used_at__isnull=True,
        code_hash__isnull=True,
        expires_at__gt=timezone.now(),
    ).update(telegram_chat_id=chat_id)
    telegram_client.send_quietly(chat_id, MSG_SHARE_CONTACT, reply_markup=SHARE_CONTACT_KEYBOARD)


def handle_contact(chat_id: int, sender: dict, contact: dict) -> None:
    """The chat's own contact, shared while the chat is in the reset flow."""
    now = timezone.now()
    with transaction.atomic(using=BYPASS_ALIAS):
        reset = (
            PasswordReset.objects.using(BYPASS_ALIAS)
            .select_for_update()
            .select_related("user")
            .filter(telegram_chat_id=chat_id, used_at__isnull=True, expires_at__gt=now)
            .order_by("-created_at")
            .first()
        )
        if reset is None or not phones_match(contact.get("phone_number"), reset.user.phone):
            reply, markup = MSG_NOT_VERIFIED, REMOVE_KEYBOARD
            code = None
        elif reset.codes_sent >= settings.PASSWORD_RESET_MAX_CODES_PER_REQUEST:
            reply, markup = MSG_TOO_MANY_CODES, REMOVE_KEYBOARD
            code = None
        else:
            code = f"{secrets.randbelow(1_000_000):06d}"
            reset.code_hash = _hash_code(reset, code)
            reset.codes_sent += 1
            reset.save(using=BYPASS_ALIAS, update_fields=["code_hash", "codes_sent"])
            _link_telegram_account(reset.user, chat_id, sender, contact)
            reply, markup = MSG_CODE.format(code=code), REMOVE_KEYBOARD

    telegram_client.send_quietly(chat_id, reply, reply_markup=markup)


def _link_telegram_account(user, chat_id: int, sender: dict, contact: dict) -> None:
    TelegramAccount.objects.using(BYPASS_ALIAS).update_or_create(
        user=user,
        defaults={
            "organization_id": user.organization_id,
            "chat_id": chat_id,
            "telegram_user_id": sender["id"],
            "username": (sender.get("username") or "")[:64] or None,
            "verified_phone": digits_only(contact.get("phone_number"))[:20],
        },
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _hash_code(reset: PasswordReset, code: str) -> str:
    """Keyed + bound to the reset row: a 6-digit space is trivially
    brute-forced from a plain hash if the table ever leaked."""
    key = settings.SECRET_KEY.encode()
    return hmac.new(key, f"{reset.pk}:{code}".encode(), hashlib.sha256).hexdigest()
