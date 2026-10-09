"""Texts for system-generated notifications, per language.

A student gets them in their account's language (`User.language`); a
parent has no account and therefore no language on file, so parents get
DEFAULT_LANGUAGE. Every message exists in two voices: to the student
("you missed class") and to a parent ("Ali missed class").
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

DEFAULT_LANGUAGE = "uz"
LANGUAGES = ("uz", "ru", "en")


@dataclass(frozen=True)
class Text:
    title: str
    body: str


def _lang(language: str | None) -> str:
    return language if language in LANGUAGES else DEFAULT_LANGUAGE


def format_amount(amount: Decimal, currency: str) -> str:
    """500000.00 -> "500 000 UZS" (no tiyin/kopeks: nobody bills them)."""
    whole = f"{int(amount.quantize(Decimal('1'))):,}".replace(",", " ")
    return f"{whole} {currency}"


def format_date(value: date) -> str:
    return value.strftime("%d.%m.%Y")


# ─── Invoice issued ───────────────────────────────────────────────────────────

_INVOICE_ISSUED = {
    "uz": (
        "Yangi to'lov",
        "{group}: {amount} to'lash kerak. Muddat: {due}.",
        "{student} uchun yangi to'lov ({group}): {amount}. Muddat: {due}.",
    ),
    "ru": (
        "Новый счёт",
        "{group}: к оплате {amount}. Срок: {due}.",
        "Новый счёт за {student} ({group}): {amount}. Срок: {due}.",
    ),
    "en": (
        "New invoice",
        "{group}: {amount} to pay. Due: {due}.",
        "New invoice for {student} ({group}): {amount}. Due: {due}.",
    ),
}

# ─── Invoice due soon ─────────────────────────────────────────────────────────

_INVOICE_DUE_SOON = {
    "uz": (
        "To'lov muddati yaqin",
        "{group}: {amount} ni {due} gacha to'lang.",
        "{student} uchun {amount} ({group}) {due} gacha to'lanishi kerak.",
    ),
    "ru": (
        "Скоро срок оплаты",
        "{group}: оплатите {amount} до {due}.",
        "За {student} ({group}) нужно оплатить {amount} до {due}.",
    ),
    "en": (
        "Payment due soon",
        "{group}: please pay {amount} by {due}.",
        "{amount} for {student} ({group}) is due by {due}.",
    ),
}

# ─── Student absent ───────────────────────────────────────────────────────────

_STUDENT_ABSENT = {
    "uz": (
        "Darsga kelmadi",
        "Siz {date} kuni {group} darsiga kelmadingiz.",
        "{student} {date} kuni {group} darsiga kelmadi.",
    ),
    "ru": (
        "Пропуск занятия",
        "Вы пропустили занятие {group} {date}.",
        "{student} пропустил(а) занятие {group} {date}.",
    ),
    "en": (
        "Missed class",
        "You missed the {group} class on {date}.",
        "{student} missed the {group} class on {date}.",
    ),
}


def _render(table: dict, language: str | None, *, for_parent: bool, **values) -> Text:
    title, to_student, to_parent = table[_lang(language)]
    return Text(title=title, body=(to_parent if for_parent else to_student).format(**values))


def invoice_issued(language, *, for_parent, student, group, amount, due) -> Text:
    return _render(_INVOICE_ISSUED, language, for_parent=for_parent, student=student, group=group, amount=amount, due=due)


def invoice_due_soon(language, *, for_parent, student, group, amount, due) -> Text:
    return _render(_INVOICE_DUE_SOON, language, for_parent=for_parent, student=student, group=group, amount=amount, due=due)


def student_absent(language, *, for_parent, student, group, date) -> Text:
    return _render(_STUDENT_ABSENT, language, for_parent=for_parent, student=student, group=group, date=date)
