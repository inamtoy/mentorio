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
        "Yangi to'lov hisobi",
        "«{group}» guruhi bo'yicha {amount} miqdorida to'lov hisoblandi. To'lov muddati: {due}.",
        "Farzandingiz {student} uchun «{group}» guruhi bo'yicha {amount} miqdorida to'lov hisoblandi. "
        "To'lov muddati: {due}.",
    ),
    "ru": (
        "Новый счёт на оплату",
        "По группе «{group}» выставлен счёт на сумму {amount}. Срок оплаты: {due}.",
        "Для {student} по группе «{group}» выставлен счёт на сумму {amount}. Срок оплаты: {due}.",
    ),
    "en": (
        "New invoice",
        "An invoice of {amount} has been issued for the {group} group. Due date: {due}.",
        "An invoice of {amount} has been issued for {student} ({group} group). Due date: {due}.",
    ),
}

# ─── Invoice due soon ─────────────────────────────────────────────────────────

_INVOICE_DUE_SOON = {
    "uz": (
        "To'lov muddati yaqinlashmoqda",
        "«{group}» guruhi bo'yicha {amount} miqdoridagi to'lovni {due} sanasigacha amalga oshirishingizni so'raymiz.",
        "Farzandingiz {student} uchun «{group}» guruhi bo'yicha {amount} miqdoridagi to'lovni {due} sanasigacha "
        "amalga oshirishingizni so'raymiz.",
    ),
    "ru": (
        "Приближается срок оплаты",
        "Просим оплатить {amount} по группе «{group}» до {due}.",
        "Просим оплатить {amount} за {student} по группе «{group}» до {due}.",
    ),
    "en": (
        "Payment due soon",
        "Please pay {amount} for the {group} group by {due}.",
        "Please pay {amount} for {student} ({group} group) by {due}.",
    ),
}

# ─── Student absent ───────────────────────────────────────────────────────────

_STUDENT_ABSENT = {
    "uz": (
        "Darsga qatnashmaganlik haqida xabarnoma",
        "Siz {date} kuni «{group}» guruhidagi darsga qatnashmadingiz.",
        "Farzandingiz {student} {date} kuni «{group}» guruhidagi darsga qatnashmadi.",
    ),
    "ru": (
        "Пропуск занятия",
        "Вы не присутствовали на занятии группы «{group}» {date}.",
        "{student} не присутствовал(а) на занятии группы «{group}» {date}.",
    ),
    "en": (
        "Missed class",
        "You did not attend the {group} class on {date}.",
        "{student} did not attend the {group} class on {date}.",
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
