"""Notifications v1: linking chats through the bot, the three events
(invoice issued, invoice due soon, student absent), the outbox worker, and
the Settings endpoint. Telegram is replaced by a recorder; no network.

Fixture setup goes through the auth_bypass_rls alias — see
finance/tests/test_finance.py's module docstring for why, under
`transaction=True`, this is what's needed.
"""

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.management import call_command
from django.db import transaction as db_transaction
from django.utils import timezone
from rest_framework.test import APIClient

from attendance.models import Attendance
from auth_custom.models import TelegramAccount
from auth_custom.services import password_reset_service, telegram_bot, telegram_client
from common.context import apply_org_context
from course.models import Course
from finance.models import Invoice, Payment
from foundation.models import Organization, Role, User, UserRole
from groups.models import Group
from notifications.models import Notification, NotificationDelivery, ParentTelegramLink
from notifications.services import delivery
from student.models import StudentParent, StudentProfile
from teacher.models import TeacherProfile

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _random_phone():
    """Free text, the way admins type it. Fresh per test: tables in custom
    schemas survive Django's between-test flush (it only truncates tables
    it finds on the search_path), so fixed numbers would match rows left
    by earlier tests."""
    digits = f"{uuid.uuid4().int % 10**7:07d}"
    return f"+998 9{digits[0]} {digits[1:4]}-{digits[4:6]}-{digits[6:]}"


def _tg_digits(phone):
    """How Telegram reports a contact: bare digits with the country code."""
    return "998" + "".join(c for c in phone if c.isdigit())[-9:]


def _random_id():
    return uuid.uuid4().int % 10**12


@pytest.fixture(autouse=True)
def ids(monkeypatch):
    """Per-test phones and Telegram ids (see _random_phone)."""
    values = {
        "STUDENT_PHONE": _random_phone(), "PARENT_PHONE": _random_phone(),
        "STUDENT_CHAT": _random_id(), "PARENT_CHAT": _random_id(),
        "STUDENT_TG": _random_id(), "PARENT_TG": _random_id(),
    }
    for name, value in values.items():
        monkeypatch.setitem(globals(), name, value)
    return values


@pytest.fixture(autouse=True)
def telegram_settings(settings):
    settings.TELEGRAM_BOT_TOKEN = "123:test-token"
    settings.TELEGRAM_BOT_USERNAME = "test_mentorio_bot"


@pytest.fixture
def sent(monkeypatch):
    """Every message the bot sent, as (chat_id, text, reply_markup)."""
    messages = []
    monkeypatch.setattr(
        telegram_client, "send_message",
        lambda chat_id, text, reply_markup=None: messages.append((chat_id, text, reply_markup)),
    )
    return messages


# ─── fixtures ─────────────────────────────────────────────────────────────────


def _make_org():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-tg-notif-{uuid.uuid4().hex[:8]}", email="a@example.com"
        )


def _make_user(org, phone, role_slug, first_name="U", last_name="User"):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name=first_name, last_name=last_name, password="pw123456", phone=phone,
        status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug=role_slug)
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    return user


def _make_student(org, phone=None, *, language="uz"):
    user = _make_user(org, phone or STUDENT_PHONE, "student", first_name="Ali", last_name="Valiyev")
    user.language = language
    user.save(using=BYPASS_ALIAS, update_fields=["language"])
    return StudentProfile.objects.using(BYPASS_ALIAS).create(
        organization=org, user=user, student_code=f"STU-{uuid.uuid4().hex[:6]}"
    )


def _make_parent(student, phone=None):
    return StudentParent.objects.using(BYPASS_ALIAS).create(
        organization_id=student.organization_id, student_profile=student, relation="mother",
        first_name="Zuhra", last_name="Valiyeva", phone=phone or PARENT_PHONE,
    )


def _make_group(org):
    teacher_user = _make_user(org, _random_phone(), "teacher", first_name="T")
    teacher = TeacherProfile.objects.using(BYPASS_ALIAS).create(
        organization=org, user=teacher_user, teacher_code=f"TCH-{uuid.uuid4().hex[:6]}"
    )
    course = Course.objects.using(BYPASS_ALIAS).create(
        organization=org, name="IELTS", code=f"CRS-{uuid.uuid4().hex[:6]}", category="Languages"
    )
    group = Group.objects.using(BYPASS_ALIAS).create(
        organization=org, course=course, teacher=teacher, code=f"GRP-{uuid.uuid4().hex[:6]}", name="IELTS-3",
        start_date="2026-09-01",
    )
    return group, teacher_user


def _login(user):
    client = APIClient()
    response = client.post("/api/v1/auth/login/", {"login_id": user.login_id, "password": "pw123456"}, format="json")
    assert response.status_code == 200
    return client


def _bot(text=None, contact=None, *, chat_id, from_id):
    message = {"chat": {"id": chat_id, "type": "private"}, "from": {"id": from_id, "username": "tg_user"}}
    if text is not None:
        message["text"] = text
    if contact is not None:
        message["contact"] = contact
    telegram_bot.handle_update({"update_id": 1, "message": message})


def _share_own_contact(phone, *, chat_id, from_id):
    _bot("/start", chat_id=chat_id, from_id=from_id)
    _bot(contact={"phone_number": phone, "user_id": from_id}, chat_id=chat_id, from_id=from_id)


def _link_student_and_parent(student, parent):
    _share_own_contact(_tg_digits(STUDENT_PHONE), chat_id=STUDENT_CHAT, from_id=STUDENT_TG)
    _share_own_contact(_tg_digits(PARENT_PHONE), chat_id=PARENT_CHAT, from_id=PARENT_TG)


def _deliveries(**filters):
    return NotificationDelivery.objects.using(BYPASS_ALIAS).filter(**filters)


def _notifications(**filters):
    return Notification.objects.using(BYPASS_ALIAS).filter(**filters)


# ─── linking through the bot ──────────────────────────────────────────────────


def test_contact_links_the_students_account_and_every_parent_record_with_that_number(sent):
    org_a, org_b = _make_org(), _make_org()
    student = _make_student(org_a)
    # The same mother has a child in another center too.
    other_child = _make_student(org_b, phone=_random_phone())
    parent_a, parent_b = _make_parent(student), _make_parent(other_child)

    _share_own_contact(_tg_digits(STUDENT_PHONE), chat_id=STUDENT_CHAT, from_id=STUDENT_TG)
    _share_own_contact(_tg_digits(PARENT_PHONE), chat_id=PARENT_CHAT, from_id=PARENT_TG)

    account = TelegramAccount.objects.using(BYPASS_ALIAS).get(user=student.user)
    assert account.chat_id == STUDENT_CHAT and account.notifications_enabled
    links = ParentTelegramLink.objects.using(BYPASS_ALIAS).filter(chat_id=PARENT_CHAT)
    assert {link.student_parent_id for link in links} == {parent_a.id, parent_b.id}
    assert "farzandingiz" in sent[-1][1]


def test_unknown_number_links_nothing(sent):
    _make_student(_make_org())
    _share_own_contact(_tg_digits(_random_phone()), chat_id=STUDENT_CHAT, from_id=STUDENT_TG)

    assert sent[-1][1] == telegram_bot.MSG_NOT_FOUND
    assert not TelegramAccount.objects.using(BYPASS_ALIAS).filter(chat_id__in=[STUDENT_CHAT, PARENT_CHAT]).exists()


def test_forwarded_contact_of_someone_else_links_nothing(sent):
    _make_student(_make_org())
    _bot("/start", chat_id=PARENT_CHAT, from_id=PARENT_TG)
    _bot(contact={"phone_number": _tg_digits(STUDENT_PHONE), "user_id": STUDENT_TG}, chat_id=PARENT_CHAT, from_id=PARENT_TG)

    assert sent[-1][1] == telegram_bot.MSG_NOT_OWN_CONTACT
    assert not TelegramAccount.objects.using(BYPASS_ALIAS).filter(chat_id__in=[STUDENT_CHAT, PARENT_CHAT]).exists()


def test_contact_after_an_unknown_reset_link_gets_the_reset_reply_not_a_link(sent):
    """No login_id enumeration: a dead reset link must answer exactly like
    a phone mismatch, even though the number matches a real account."""
    _make_student(_make_org())
    _bot("/start not-a-real-reset-token", chat_id=STUDENT_CHAT, from_id=STUDENT_TG)
    _bot(contact={"phone_number": _tg_digits(STUDENT_PHONE), "user_id": STUDENT_TG}, chat_id=STUDENT_CHAT, from_id=STUDENT_TG)

    assert sent[-1][1] == password_reset_service.MSG_NOT_VERIFIED
    assert not TelegramAccount.objects.using(BYPASS_ALIAS).filter(chat_id__in=[STUDENT_CHAT, PARENT_CHAT]).exists()


def test_stop_switches_everything_off_and_sharing_again_switches_it_back_on(sent):
    student = _make_student(_make_org())
    _make_parent(student, phone=STUDENT_PHONE)  # student registered with the parent's number
    _share_own_contact(_tg_digits(STUDENT_PHONE), chat_id=STUDENT_CHAT, from_id=STUDENT_TG)

    _bot("/stop", chat_id=STUDENT_CHAT, from_id=STUDENT_TG)
    assert sent[-1][1] == telegram_bot.MSG_STOPPED
    assert not TelegramAccount.objects.using(BYPASS_ALIAS).get(user=student.user).notifications_enabled
    assert not ParentTelegramLink.objects.using(BYPASS_ALIAS).get(student_parent__student_profile=student).active

    _share_own_contact(_tg_digits(STUDENT_PHONE), chat_id=STUDENT_CHAT, from_id=STUDENT_TG)
    assert TelegramAccount.objects.using(BYPASS_ALIAS).get(user=student.user).notifications_enabled
    assert ParentTelegramLink.objects.using(BYPASS_ALIAS).get(student_parent__student_profile=student).active


# ─── events ───────────────────────────────────────────────────────────────────


def _mark(client, group, student, status, attendance_id=None):
    payload = {
        "organization": str(group.organization_id), "group": str(group.id), "student_profile": str(student.id),
        "date": "2026-10-09", "status": status,
    }
    if attendance_id is None:
        return client.post("/api/v1/attendance/", payload, format="json")
    return client.patch(f"/api/v1/attendance/{attendance_id}/", {"status": status}, format="json")


def test_marking_absent_notifies_the_student_inbox_and_both_telegram_chats(sent):
    org = _make_org()
    student = _make_student(org)
    parent = _make_parent(student)
    _link_student_and_parent(student, parent)
    group, teacher = _make_group(org)

    response = _mark(_login(teacher), group, student, "absent")
    assert response.status_code == 201

    notification = _notifications(recipient=student.user).get()
    assert notification.category == "attendance"
    assert "IELTS-3" in notification.message
    student_row = _deliveries(recipient_user=student.user).get()
    parent_row = _deliveries(student_parent=parent).get()
    assert (student_row.chat_id, parent_row.chat_id) == (STUDENT_CHAT, PARENT_CHAT)
    assert student_row.notification_id == notification.id
    assert "Ali Valiyev" in parent_row.text and "kelmadi" in parent_row.text
    assert {student_row.status, parent_row.status} == {"pending"}


def test_absent_notifies_once_per_record_and_only_on_the_transition(sent):
    org = _make_org()
    student = _make_student(org)
    _link_student_and_parent(student, _make_parent(student))
    group, teacher = _make_group(org)
    client = _login(teacher)

    attendance_id = _mark(client, group, student, "present").json()["data"]["id"]
    assert not _notifications(recipient=student.user).exists()

    _mark(client, group, student, "absent", attendance_id)
    client.patch(f"/api/v1/attendance/{attendance_id}/", {"notes": "called home"}, format="json")
    _mark(client, group, student, "present", attendance_id)
    _mark(client, group, student, "absent", attendance_id)

    assert _notifications(recipient=student.user).count() == 1
    assert _deliveries(organization=org).count() == 2


def test_student_and_parent_sharing_one_chat_get_one_message(sent):
    org = _make_org()
    student = _make_student(org)
    _make_parent(student, phone=STUDENT_PHONE)
    _share_own_contact(_tg_digits(STUDENT_PHONE), chat_id=STUDENT_CHAT, from_id=STUDENT_TG)
    group, teacher = _make_group(org)

    _mark(_login(teacher), group, student, "absent")

    assert _deliveries(organization=org).count() == 1


def test_student_language_is_used_for_their_message_and_uzbek_for_parents(sent):
    org = _make_org()
    student = _make_student(org, language="ru")
    _link_student_and_parent(student, _make_parent(student))
    group, teacher = _make_group(org)

    _mark(_login(teacher), group, student, "absent")

    assert "Пропуск" in _notifications(recipient=student.user).get().title
    assert "kelmadi" in _deliveries(organization=org, student_parent__isnull=False).get().text


def test_no_telegram_link_still_fills_the_inbox(sent):
    org = _make_org()
    student = _make_student(org)
    group, teacher = _make_group(org)

    _mark(_login(teacher), group, student, "absent")

    assert _notifications(recipient=student.user).count() == 1
    assert not _deliveries(organization=org).exists()


def test_creating_an_invoice_notifies(sent):
    org = _make_org()
    student = _make_student(org)
    _link_student_and_parent(student, _make_parent(student))
    group, _teacher = _make_group(org)
    admin = _make_user(org, _random_phone(), "center_admin")

    response = _login(admin).post(
        "/api/v1/finance/invoices/",
        {
            "organization": str(org.id), "student_profile": str(student.id), "group": str(group.id),
            "total_amount": "500000.00", "due_date": "2026-10-15",
        },
        format="json",
    )
    assert response.status_code == 201, response.json()

    notification = _notifications(recipient=student.user).get()
    assert notification.category == "payment"
    assert "500 000 UZS" in notification.message and "15.10.2026" in notification.message
    assert _deliveries(organization=org).count() == 2


def _invoice(student, *, due_in_days, total="300000", status="pending"):
    return Invoice.objects.using(BYPASS_ALIAS).create(
        organization_id=student.organization_id, student_profile=student, invoice_number=f"INV-{uuid.uuid4().hex[:6]}",
        total_amount=Decimal(total), due_date=timezone.localdate() + timedelta(days=due_in_days), status=status,
    )


def test_payment_reminders_cover_the_window_once_and_use_the_remaining_balance(sent):
    org = _make_org()
    student = _make_student(org)
    _link_student_and_parent(student, _make_parent(student))
    due_soon = _invoice(student, due_in_days=2)
    Payment.objects.using(BYPASS_ALIAS).create(
        organization=org, invoice=due_soon, student_profile=student, amount=Decimal("100000")
    )
    _invoice(student, due_in_days=5)  # outside the window
    _invoice(student, due_in_days=1, status="paid")  # nothing to remind about

    call_command("send_payment_reminders")
    call_command("send_payment_reminders")

    notification = _notifications(recipient=student.user, category="payment").get()
    assert "200 000 UZS" in notification.message
    assert _deliveries(organization=org).count() == 2


# ─── worker ───────────────────────────────────────────────────────────────────


def _queued_delivery(sent):
    org = _make_org()
    student = _make_student(org)
    _share_own_contact(_tg_digits(STUDENT_PHONE), chat_id=STUDENT_CHAT, from_id=STUDENT_TG)
    group, teacher = _make_group(org)
    _mark(_login(teacher), group, student, "absent")
    sent.clear()
    # Leftovers from other tests must not be sent in this one.
    NotificationDelivery.objects.using(BYPASS_ALIAS).exclude(organization=org).filter(status="pending").update(
        status="failed"
    )
    return _deliveries(organization=org).get()


def test_worker_sends_pending_deliveries(sent):
    row = _queued_delivery(sent)

    assert delivery.send_pending(sleep=lambda _s: None) == 1

    row.refresh_from_db(using=BYPASS_ALIAS)
    assert row.status == "sent" and row.sent_at is not None
    assert sent == [(STUDENT_CHAT, row.text, None)]
    assert delivery.send_pending(sleep=lambda _s: None) == 0


def _failing(monkeypatch, **error):
    def fail(chat_id, text, reply_markup=None):
        raise telegram_client.TelegramError("sendMessage failed: boom", **error)

    monkeypatch.setattr(telegram_client, "send_message", fail)


def _make_due(row):
    NotificationDelivery.objects.using(BYPASS_ALIAS).filter(pk=row.pk).update(next_attempt_at=timezone.now())


def test_worker_retries_with_backoff_then_gives_up(sent, monkeypatch):
    row = _queued_delivery(sent)
    _failing(monkeypatch, status=502)

    for attempt in range(1, delivery.MAX_ATTEMPTS + 1):
        delivery.send_pending(sleep=lambda _s: None)
        row.refresh_from_db(using=BYPASS_ALIAS)
        assert row.attempts == attempt
        if attempt < delivery.MAX_ATTEMPTS:
            assert row.status == "pending" and row.next_attempt_at > timezone.now()
            _make_due(row)

    assert row.status == "failed" and "boom" in row.last_error


def test_blocked_bot_fails_at_once_and_switches_the_chat_off(sent, monkeypatch):
    row = _queued_delivery(sent)
    _failing(monkeypatch, status=403)

    delivery.send_pending(sleep=lambda _s: None)

    row.refresh_from_db(using=BYPASS_ALIAS)
    assert row.status == "failed" and row.attempts == 1
    assert not TelegramAccount.objects.using(BYPASS_ALIAS).get(user=row.recipient_user_id).notifications_enabled


# ─── Settings endpoint ────────────────────────────────────────────────────────


def test_my_telegram_reports_and_toggles_only_my_own_link(sent):
    org = _make_org()
    student = _make_student(org)
    client = _login(student.user)

    before = client.get("/api/v1/notifications/telegram/").json()["data"]
    assert before == {
        "connected": False, "username": None, "notifications_enabled": False,
        "bot_url": "https://t.me/test_mentorio_bot?start=connect",
    }
    refused = client.patch("/api/v1/notifications/telegram/", {"notifications_enabled": False}, format="json")
    assert refused.status_code == 400

    _share_own_contact(_tg_digits(STUDENT_PHONE), chat_id=STUDENT_CHAT, from_id=STUDENT_TG)
    off = client.patch("/api/v1/notifications/telegram/", {"notifications_enabled": False}, format="json")
    assert off.status_code == 200
    assert off.json()["data"]["connected"] is True and off.json()["data"]["notifications_enabled"] is False
    assert not TelegramAccount.objects.using(BYPASS_ALIAS).get(user=student.user).notifications_enabled


def test_parent_list_shows_who_is_connected(sent):
    org = _make_org()
    student = _make_student(org)
    connected, not_connected = _make_parent(student), _make_parent(student, phone=_random_phone())
    _share_own_contact(_tg_digits(PARENT_PHONE), chat_id=PARENT_CHAT, from_id=PARENT_TG)
    admin = _make_user(org, _random_phone(), "center_admin")

    rows = _login(admin).get(f"/api/v1/students/parents/?student_profile={student.id}").json()["data"]
    rows = rows["results"] if isinstance(rows, dict) else rows
    flags = {row["id"]: row["telegram_connected"] for row in rows}
    assert flags == {str(connected.id): True, str(not_connected.id): False}


# ─── tenant isolation ─────────────────────────────────────────────────────────


def test_rls_hides_other_centers_deliveries_and_parent_links(sent):
    org_a, org_b = _make_org(), _make_org()
    for org, phone, chat, tg in [(org_a, STUDENT_PHONE, STUDENT_CHAT, STUDENT_TG),
                                 (org_b, PARENT_PHONE, PARENT_CHAT, PARENT_TG)]:
        student = _make_student(org, phone=phone)
        _make_parent(student, phone=phone)
        _share_own_contact(_tg_digits(phone), chat_id=chat, from_id=tg)
        group, teacher = _make_group(org)
        _mark(_login(teacher), group, student, "absent")

    with db_transaction.atomic():
        apply_org_context(str(org_a.id))
        assert {row.organization_id for row in NotificationDelivery.objects.all()} == {org_a.id}
        assert {row.organization_id for row in ParentTelegramLink.objects.all()} == {org_a.id}


# ─── number changes ───────────────────────────────────────────────────────────


def test_changing_a_number_disconnects_the_old_chat(sent):
    """The chat proved it owned the OLD number. After an admin changes the
    number on file, that chat must stop getting this student's messages."""
    org = _make_org()
    student = _make_student(org)
    parent = _make_parent(student)
    _link_student_and_parent(student, parent)
    group, teacher = _make_group(org)

    User.objects.using(BYPASS_ALIAS).filter(pk=student.user_id).update(phone=_random_phone())
    StudentParent.objects.using(BYPASS_ALIAS).filter(pk=parent.pk).update(phone=_random_phone())

    _mark(_login(teacher), group, student, "absent")
    assert _notifications(recipient=student.user).count() == 1
    assert not _deliveries(organization=org).exists()

    status = _login(student.user).get("/api/v1/notifications/telegram/").json()["data"]
    assert status["connected"] is False
