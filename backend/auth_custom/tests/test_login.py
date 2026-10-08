"""Requires both `educore_app` and `educore_auth_bypass` Postgres roles to
already exist on whatever server runs the test suite (the latter needs
BYPASSRLS) — same roles a real deployment needs, see .env.example.
"""

import uuid

import pytest
from django.db import transaction as db_transaction
from rest_framework.response import Response
from rest_framework.test import APIClient

from common.context import apply_org_context
from common.cookies import set_auth_cookies
from foundation.models import Organization, Setting, User
from foundation.services import DEFAULT_SECURITY_SETTINGS

# transaction=True: LoginView reads/writes via the separate `auth_bypass_rls`
# connection alias. Under the default wrapped-transaction test isolation,
# that connection is a genuinely different DB session and can't see rows the
# `user` fixture inserted (but never committed) via `default` — Postgres
# MVCC hides uncommitted work from other sessions regardless of MIRROR/same
# physical DB. transaction=True makes fixtures actually commit (cleaned up
# via truncation after the test), so the bypass connection can see them.
pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


@pytest.fixture
def user():
    # Unique slug per call, not a fixed literal: transaction=True's post-test
    # flush truncates via Django's introspected table list, which only sees
    # the default (unqualified) search_path — our tables live in named
    # schemas (foundation, auth, ...) outside it, so they never actually get
    # truncated between tests and a fixed slug would collide.
    #
    # Created via the auth_bypass_rls alias, org id pre-generated and org
    # context applied first — an Organization's own id can't satisfy its RLS
    # policy at insert time otherwise (see finance/tests/test_finance.py's
    # module docstring for the full chicken-and-egg reasoning).
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        org = Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-login-test-{uuid.uuid4().hex[:8]}", email="a@example.com"
        )
    return User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="Alice", last_name="Doe", password="s3cret-pass", status="active",
        phone="+998901234567",
    )


def _set_max_login_attempts(n: int) -> None:
    # Direct BYPASS_ALIAS write, not foundation.services.set_platform_setting()
    # — that helper runs on the `default` connection, which needs a real org
    # context to satisfy RLS; nothing in this test module ever establishes
    # one (there's no HTTP request wrapping these calls), same reasoning as
    # every other direct-DB-setup fixture in this codebase using BYPASS_ALIAS.
    Setting.objects.using(BYPASS_ALIAS).update_or_create(
        scope="platform", organization=None, branch=None, user=None, key="security",
        defaults={"value": {**DEFAULT_SECURITY_SETTINGS, "maxLoginAttempts": n}},
    )


def test_login_with_correct_credentials_returns_tokens(user):
    client = APIClient()
    response = client.post(
        "/api/v1/auth/login/", {"login_id": user.login_id, "password": "s3cret-pass"}, format="json"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert "access_token" in response.cookies and "refresh_token" in response.cookies
    # Frontend seeds its locale cookie from this on a device that hasn't
    # picked a language yet — see lib/api/auth.ts's login().
    assert body["data"]["user"]["language"] == "uz"
    assert response.cookies["access_token"]["httponly"]
    assert "access" not in body["data"] and "refresh" not in body["data"]


def test_login_with_wrong_password_is_rejected(user):
    client = APIClient()
    response = client.post(
        "/api/v1/auth/login/", {"login_id": user.login_id, "password": "wrong-password"}, format="json"
    )

    assert response.status_code == 401
    assert response.json()["success"] is False


def test_login_for_suspended_account_is_rejected(user):
    user.status = "suspended"
    user.save(using=BYPASS_ALIAS, update_fields=["status"])

    client = APIClient()
    response = client.post(
        "/api/v1/auth/login/", {"login_id": user.login_id, "password": "s3cret-pass"}, format="json"
    )

    assert response.status_code == 401


def test_login_locks_out_after_max_failed_attempts(user):
    """maxLoginAttempts (Super-Admin Settings' Security panel) — the 6th
    attempt is blocked outright, even with the *correct* password, until
    the lockout window elapses. Explicitly set to 5 here rather than
    relying on the default: `security` is a genuine platform-wide
    singleton (see foundation.services.get_platform_setting), so another
    test writing a different value would otherwise leak into this one."""
    _set_max_login_attempts(5)
    client = APIClient()
    for _ in range(5):
        response = client.post(
            "/api/v1/auth/login/", {"login_id": user.login_id, "password": "wrong-password"}, format="json"
        )
        assert response.status_code == 401

    still_wrong = client.post(
        "/api/v1/auth/login/", {"login_id": user.login_id, "password": "wrong-password"}, format="json"
    )
    assert still_wrong.status_code == 401
    assert "too many" in still_wrong.json()["message"].lower()

    correct_but_locked = client.post(
        "/api/v1/auth/login/", {"login_id": user.login_id, "password": "s3cret-pass"}, format="json"
    )
    assert correct_but_locked.status_code == 401
    assert "too many" in correct_but_locked.json()["message"].lower()


def test_login_lockout_is_scoped_to_one_login_id(user):
    """A different account's failed attempts must never affect this one —
    the lockout counts LoginAttempt rows filtered by `login_id`."""
    _set_max_login_attempts(5)
    other_org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(other_org_id))
        other_org = Organization.objects.using(BYPASS_ALIAS).create(
            id=other_org_id, name="Other", slug=f"org-login-lockout-{uuid.uuid4().hex[:8]}", email="b@example.com"
        )
    other_user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=other_org, first_name="Bob", last_name="Doe", password="s3cret-pass", status="active",
        phone="+998907654321",
    )

    client = APIClient()
    for _ in range(5):
        client.post("/api/v1/auth/login/", {"login_id": other_user.login_id, "password": "wrong-password"}, format="json")

    response = client.post("/api/v1/auth/login/", {"login_id": user.login_id, "password": "s3cret-pass"}, format="json")
    assert response.status_code == 200


def test_authenticated_request_can_list_own_sessions(user):
    client = APIClient()
    login_response = client.post(
        "/api/v1/auth/login/", {"login_id": user.login_id, "password": "s3cret-pass"}, format="json"
    )
    assert login_response.status_code == 200

    # APIClient carries cookies between calls on the same instance, same as
    # a real browser — no manual Authorization header needed.
    response = client.get("/api/v1/auth/sessions/")

    assert response.status_code == 200
    sessions = response.json()["data"]
    assert len(sessions) == 1
    assert sessions[0]["current"] is True


def test_logout_revokes_current_session(user):
    """Regression test: LogoutView revoking request.auth's own session row
    used to deadlock — SessionValidatingJWTAuthentication's last_activity_at
    UPDATE (via `default`) held a lock the logout revoke's UPDATE (via
    BYPASS_ALIAS, a second connection) then blocked on, inside the same
    request-wide transaction.atomic() from OrganizationContextMiddleware.
    """
    client = APIClient()
    login_response = client.post(
        "/api/v1/auth/login/", {"login_id": user.login_id, "password": "s3cret-pass"}, format="json"
    )
    assert login_response.status_code == 200

    logout_response = client.post("/api/v1/auth/logout/")
    assert logout_response.status_code == 200
    assert logout_response.json()["success"] is True

    response = client.get("/api/v1/auth/sessions/")
    assert response.status_code == 401


def test_role_cookie_lives_as_long_as_refresh_cookie():
    """proxy.ts treats a refresh cookie as "signed in" and needs the role
    cookie to pick a portal — if the role cookie expired first, every stale
    session used to fall through to the Admin portal at `/`.
    """
    response = Response()
    set_auth_cookies(response, access="a", refresh="r", role="teacher")

    assert response.cookies["user_role"]["max-age"] == response.cookies["refresh_token"]["max-age"]


def test_failed_refresh_clears_auth_cookies(user):
    client = APIClient()
    client.cookies["refresh_token"] = "not-a-real-token"
    client.cookies["user_role"] = "center_admin"

    response = client.post("/api/v1/auth/refresh/")

    assert response.status_code == 401
    assert response.json()["success"] is False
    for name in ("access_token", "refresh_token", "user_role"):
        assert response.cookies[name].value == ""
        assert response.cookies[name]["max-age"] == 0
