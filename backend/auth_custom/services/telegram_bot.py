"""The Mentorio Telegram bot: one entry point for every update, routing to
the flow the chat is in. Called by the production webhook
(auth_custom.views.TelegramWebhookView) and the local polling command
(`manage.py run_telegram_bot`).

    /start <token>    password reset deep link   -> password_reset_service
    /start, /start connect                         -> connect notifications
    contact (own)     reset flow if the chat's latest /start was a reset
                      link (still fresh), otherwise link notifications
    /stop                                          -> switch notifications off

A contact message carries no context, so the chat's latest intent is kept
in TelegramChatState — including for reset links that matched nothing,
which must keep getting the reset flow's "couldn't verify" reply.

Every update arrives without org context: BYPASS_ALIAS, as in the flows
it routes to.
"""

from __future__ import annotations

import html

from django.conf import settings
from django.utils import timezone

from auth_custom.models import TelegramChatState
from auth_custom.services import password_reset_service, telegram_client
from auth_custom.services.session_service import BYPASS_ALIAS
from notifications.services.telegram_links import link_by_phone, unlink_chat

CONNECT_PARAM = "connect"

# ─── Bot copy (Uzbek — the bot speaks to every center's users) ───────────────

MSG_WELCOME = (
    "Assalomu alaykum! Siz <b>Mentorio</b> — o'quv markazlarini boshqarish tizimining rasmiy botidasiz.\n\n"
    "📬 To'lovlar va davomat bo'yicha xabarnomalarni olish uchun quyidagi <b>«📱 Raqamni yuborish»</b> tugmasini bosing. "
    "Telefon raqamingiz o'quv markazida ro'yxatga olingan raqam bilan solishtiriladi.\n\n"
    "🔐 Parolni tiklash uchun Mentorio tizimining kirish sahifasida <b>«Forgot password?»</b> havolasini bosing."
)
MSG_NOT_OWN_CONTACT = (
    "Iltimos, boshqa shaxsning kontaktini emas, quyidagi tugma orqali <b>o'z telefon raqamingizni</b> yuboring."
)
MSG_LINKED = (
    "✅ Telegram hisobingiz Mentorio tizimiga muvaffaqiyatli ulandi.\n\n"
    "{lines}\n\n"
    "Xabarnomalarni o'chirish uchun /stop buyrug'ini yuboring."
)
MSG_LINKED_USER = "• {name} — {role} («{organization}»)"
MSG_LINKED_CHILD = "• {name} — farzandingiz («{organization}»)"
MSG_NOT_FOUND = (
    "❌ Ushbu telefon raqami Mentorio tizimidagi o'quv markazlarida ro'yxatdan o'tmagan.\n\n"
    "Iltimos, o'quv markazi administratoriga murojaat qilib, raqamingizni o'quvchi yoki ota-ona sifatida "
    "qo'shishni so'rang, so'ngra qayta urinib ko'ring."
)
MSG_STOPPED = "🔕 Xabarnomalar o'chirildi. Qayta yoqish uchun /start buyrug'ini yuboring."
MSG_NOTHING_TO_STOP = "Ushbu chat uchun faol xabarnomalar mavjud emas."

# How each linked account is described. The bot links every active account
# with the shared number (staff too), so the label must come from the
# account's real role — never assume "student".
ROLE_LABELS = {
    "student": "o'quvchi",
    "teacher": "o'qituvchi",
    "center_admin": "o'quv markazi administratori",
    "super_admin": "platforma administratori",
}
DEFAULT_ROLE_LABEL = "foydalanuvchi"


def role_label(slug: str | None) -> str:
    return ROLE_LABELS.get(slug or "", DEFAULT_ROLE_LABEL)

def handle_update(update: dict) -> None:
    """Never raises for bad input: a malformed update is simply ignored."""
    message = update.get("message")
    if not isinstance(message, dict):
        return
    chat = message.get("chat") or {}
    sender = message.get("from") or {}
    chat_id = chat.get("id")
    if chat.get("type") != "private" or not chat_id:
        return

    text = (message.get("text") or "").strip()
    if text.startswith("/start"):
        _handle_start(chat_id, text.removeprefix("/start").strip())
    elif text == "/stop":
        _handle_stop(chat_id)
    elif "contact" in message:
        _handle_contact(chat_id, sender, message["contact"])
    else:
        _send_welcome(chat_id)


def _handle_start(chat_id: int, param: str) -> None:
    if not param or param == CONNECT_PARAM:
        _set_intent(chat_id, "connect")
        _send_welcome(chat_id)
        return
    _set_intent(chat_id, "reset")
    password_reset_service.bind_chat(chat_id, param)


def _handle_contact(chat_id: int, sender: dict, contact: dict) -> None:
    # A forwarded contact card carries someone else's user_id (or none):
    # only a contact the sender shared about THEMSELVES proves they own it.
    if not sender.get("id") or contact.get("user_id") != sender.get("id"):
        telegram_client.send_quietly(
            chat_id, MSG_NOT_OWN_CONTACT, reply_markup=password_reset_service.SHARE_CONTACT_KEYBOARD
        )
        return

    if _in_reset_flow(chat_id):
        password_reset_service.handle_contact(chat_id, sender, contact)
        return

    result = link_by_phone(chat_id=chat_id, sender=sender, contact=contact)
    if not result.linked_anything:
        reply = MSG_NOT_FOUND
    else:
        lines = [
            MSG_LINKED_USER.format(
                name=html.escape(user.name), role=role_label(user.role), organization=html.escape(user.organization)
            )
            for user in result.users
        ]
        lines += [
            MSG_LINKED_CHILD.format(name=html.escape(child.name), organization=html.escape(child.organization))
            for child in result.children
        ]
        reply = MSG_LINKED.format(lines="\n".join(lines))
    telegram_client.send_quietly(chat_id, reply, reply_markup=password_reset_service.REMOVE_KEYBOARD)


def _handle_stop(chat_id: int) -> None:
    stopped = unlink_chat(chat_id)
    telegram_client.send_quietly(chat_id, MSG_STOPPED if stopped else MSG_NOTHING_TO_STOP)


def _send_welcome(chat_id: int) -> None:
    telegram_client.send_quietly(chat_id, MSG_WELCOME, reply_markup=password_reset_service.SHARE_CONTACT_KEYBOARD)


def _set_intent(chat_id: int, intent: str) -> None:
    TelegramChatState.objects.using(BYPASS_ALIAS).update_or_create(
        chat_id=chat_id, defaults={"intent": intent, "intent_at": timezone.now()}
    )


def _in_reset_flow(chat_id: int) -> bool:
    """A reset intent lasts as long as a reset link does; after that a
    shared contact means "connect notifications"."""
    state = TelegramChatState.objects.using(BYPASS_ALIAS).filter(chat_id=chat_id).first()
    return (
        state is not None
        and state.intent == "reset"
        and state.intent_at > timezone.now() - settings.PASSWORD_RESET_TOKEN_LIFETIME
    )
