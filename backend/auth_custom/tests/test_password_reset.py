"""Telegram password reset — the full browser ↔ bot ↔ backend round trip,
driven through the real HTTP endpoints plus password_reset_service.
handle_update() (what both the webhook and the polling command call).
Telegram itself is replaced by a recorder; no network.

Same `transaction=True` + BYPASS_ALIAS fixture reasoning as test_login.py.
"""

import re
import uuid
from datetime import timedelta

import pytest
from django.db import transaction as db_transaction
from django.utils import timezone
from rest_framework.test import APIClient

from auth_custom.models import PasswordReset, Session, TelegramAccount
from auth_custom.services import password_reset_service, telegram_client
from auth_custom.services.session_service import hash_token
from common.context import apply_org_context
from foundation.models import AuditLog, Organization, Setting, User
from foundation.services import DEFAULT_SECURITY_SETTINGS

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"
CHAT_ID = 555000111
TG_USER_ID = 777000222
WEBHOOK_SECRET = "test-webhook-secret"


@pytest.fixture(autouse=True)
def telegram_settings(settings):
    settings.TELEGRAM_BOT_TOKEN = "123:test-token"
    settings.TELEGRAM_BOT_USERNAME = "test_mentorio_bot"
    settings.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET
    # Platform-wide singleton — pin it so another module's value can't leak in.
    Setting.objects.using(BYPASS_ALIAS).update_or_create(
        scope="platform", organization=None, branch=None, user=None, key="security",
        defaults={"value": {**DEFAULT_SECURITY_SETTINGS, "passwordPolicy": "basic"}},
    )


@pytest.fixture
def sent(monkeypatch):
    """Every message the bot would have sent, as (chat_id, text, reply_markup)."""
    messages = []
    monkeypatch.setattr(
        telegram_client, "send_message",
        lambda chat_id, text, reply_markup=None: messages.append((chat_id, text, reply_markup)),
    )
    return messages


@pytest.fixture
def user():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        org = Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-reset-test-{uuid.uuid4().hex[:8]}", email="a@example.com"
        )
    return User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="Alice", last_name="Doe", password="old-pass-123", status="active",
        phone="+998 90 123-45-67",
    )


# ─── helpers ──────────────────────────────────────────────────────────────────


def _start(client, login_id):
    return client.post("/api/v1/auth/password-reset/start/", {"login_id": login_id}, format="json")


def _bot(text=None, contact=None, *, chat_id=CHAT_ID, from_id=TG_USER_ID):
    message = {"chat": {"id": chat_id, "type": "private"}, "from": {"id": from_id, "username": "alice"}}
    if text is not None:
        message["text"] = text
    if contact is not None:
        message["contact"] = contact
    password_reset_service.handle_update({"update_id": 1, "message": message})


def _own_contact(phone="998901234567", user_id=TG_USER_ID):
    return {"phone_number": phone, "user_id": user_id, "first_name": "Alice"}


def _code_from(sent_messages):
    match = re.search(r"<b>(\d{6})</b>", sent_messages[-1][1])
    assert match, f"no code in last bot message: {sent_messages[-1][1]!r}"
    return match.group(1)


def _confirm(client, token, code, new_password="new-pass-456"):
    return client.post(
        "/api/v1/auth/password-reset/confirm/",
        {"token": token, "code": code, "new_password": new_password},
        format="json",
    )


def _run_bot_flow(client, user, sent):
    token = _start(client, user.login_id).json()["data"]["token"]
    _bot(f"/start {token}")
    _bot(contact=_own_contact())
    return token, _code_from(sent)


# ─── tests ────────────────────────────────────────────────────────────────────


def test_full_reset_changes_password_and_ends_every_session(user, sent):
    client = APIClient()
    assert client.post(
        "/api/v1/auth/login/", {"login_id": user.login_id, "password": "old-pass-123"}, format="json"
    ).status_code == 200

    start = _start(client, user.login_id)
    assert start.status_code == 200
    data = start.json()["data"]
    assert data["bot_url"] == f"https://t.me/test_mentorio_bot?start={data['token']}"

    _bot(f"/start {data['token']}")
    assert sent[-1][2]["keyboard"][0][0]["request_contact"] is True
    _bot(contact=_own_contact())
    code = _code_from(sent)

    response = _confirm(client, data["token"], code)

    assert response.status_code == 200
    user.refresh_from_db(using=BYPASS_ALIAS)
    assert user.check_password("new-pass-456")
    assert not Session.objects.using(BYPASS_ALIAS).filter(user=user, is_active=True).exists()
    assert PasswordReset.objects.using(BYPASS_ALIAS).get(user=user).used_at is not None
    account = TelegramAccount.objects.using(BYPASS_ALIAS).get(user=user)
    assert (account.chat_id, account.telegram_user_id) == (CHAT_ID, TG_USER_ID)
    assert "o'zgartirildi" in sent[-1][1]
    assert AuditLog.objects.using(BYPASS_ALIAS).filter(
        entity_id=str(user.id), metadata__via="telegram_reset"
    ).exists()


def test_start_for_unknown_login_looks_identical_and_creates_nothing(sent):
    response = _start(APIClient(), "NO-SUCH-LOGIN")

    assert response.status_code == 200
    assert set(response.json()["data"]) == {"token", "bot_url", "expires_in_seconds"}
    token_hash = hash_token(response.json()["data"]["token"])
    assert not PasswordReset.objects.using(BYPASS_ALIAS).filter(token_hash=token_hash).exists()

    # The bot answers the dead link exactly like a phone mismatch. Fresh
    # chat id: auth.* rows outlive each test (see test_login.py's fixture
    # note), and another test's pending request on CHAT_ID would answer.
    fresh_chat = CHAT_ID + uuid.uuid4().int % 1_000_000
    _bot(f"/start {response.json()['data']['token']}", chat_id=fresh_chat)
    _bot(contact=_own_contact(), chat_id=fresh_chat)
    assert sent[-1][1] == password_reset_service.MSG_NOT_VERIFIED


def test_phone_mismatch_sends_no_code(user, sent):
    token = _start(APIClient(), user.login_id).json()["data"]["token"]
    _bot(f"/start {token}")
    _bot(contact=_own_contact(phone="998935550000"))

    assert sent[-1][1] == password_reset_service.MSG_NOT_VERIFIED
    assert PasswordReset.objects.using(BYPASS_ALIAS).get(user=user).code_hash is None


def test_forwarded_contact_of_someone_else_is_refused(user, sent):
    token = _start(APIClient(), user.login_id).json()["data"]["token"]
    _bot(f"/start {token}")
    # Right phone, but the card belongs to a different Telegram user.
    _bot(contact=_own_contact(user_id=TG_USER_ID + 1))

    assert sent[-1][1] == password_reset_service.MSG_NOT_OWN_CONTACT
    assert PasswordReset.objects.using(BYPASS_ALIAS).get(user=user).code_hash is None


def test_wrong_codes_burn_attempts_until_even_the_right_one_fails(user, sent, settings):
    settings.PASSWORD_RESET_MAX_CODE_ATTEMPTS = 3
    client = APIClient()
    token, code = _run_bot_flow(client, user, sent)
    wrong = "000000" if code != "000000" else "111111"

    for _ in range(3):
        assert _confirm(client, token, wrong).status_code == 400

    response = _confirm(client, token, code)
    assert response.status_code == 400
    user.refresh_from_db(using=BYPASS_ALIAS)
    assert user.check_password("old-pass-123")


def test_weak_password_does_not_consume_the_attempt(user, sent, settings):
    settings.PASSWORD_RESET_MAX_CODE_ATTEMPTS = 1
    client = APIClient()
    token, code = _run_bot_flow(client, user, sent)

    weak = _confirm(client, token, code, new_password="short")
    assert weak.status_code == 400
    assert "password" in weak.json()["data"]

    assert _confirm(client, token, code).status_code == 200


def test_starting_again_invalidates_the_previous_link(user, sent):
    client = APIClient()
    old_token, old_code = _run_bot_flow(client, user, sent)
    _start(client, user.login_id)

    assert _confirm(client, old_token, old_code).status_code == 400


def test_expired_request_is_rejected(user, sent):
    client = APIClient()
    token, code = _run_bot_flow(client, user, sent)
    reset = PasswordReset.objects.using(BYPASS_ALIAS).get(user=user)
    PasswordReset.objects.using(BYPASS_ALIAS).filter(pk=reset.pk).update(
        expires_at=reset.created_at + timedelta(microseconds=1)
    )

    assert _confirm(client, token, code).status_code == 400


def test_too_many_requests_per_hour_are_throttled(user, sent, settings):
    settings.PASSWORD_RESET_MAX_REQUESTS_PER_HOUR = 2
    client = APIClient()
    assert _start(client, user.login_id).status_code == 200
    assert _start(client, user.login_id).status_code == 200

    assert _start(client, user.login_id).status_code == 429


def test_start_is_unavailable_without_a_configured_bot(user, settings):
    settings.TELEGRAM_BOT_TOKEN = ""

    assert _start(APIClient(), user.login_id).status_code == 503


def test_webhook_requires_the_secret_header(user, sent):
    client = APIClient()
    update = {"update_id": 9, "message": {"chat": {"id": CHAT_ID, "type": "private"}, "from": {"id": 1}, "text": "/start"}}

    forged = client.post("/api/v1/auth/telegram/webhook/", update, format="json")
    assert forged.status_code == 403
    assert sent == []

    real = client.post(
        "/api/v1/auth/telegram/webhook/", update, format="json",
        HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN=WEBHOOK_SECRET,
    )
    assert real.status_code == 200
    assert sent[-1][1] == password_reset_service.MSG_WELCOME


def test_codes_are_stored_hashed(user, sent):
    _token, code = _run_bot_flow(APIClient(), user, sent)
    reset = PasswordReset.objects.using(BYPASS_ALIAS).get(user=user)

    assert code not in reset.code_hash
    assert reset.expires_at > timezone.now()
