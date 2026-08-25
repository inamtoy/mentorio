"""API-level tests for PlatformSettingsView/PlatformBrandingView (General +
Security panels) and the password-policy enforcement they drive. Same "real
login" reasoning as foundation/tests/test_user_self_update.py.

`security`/`general` are genuine platform-wide *singletons* (see
foundation.services.get_platform_setting) — every test that depends on a
particular value writes it explicitly first via BYPASS_ALIAS, rather than
assuming a default, since another test (or a previous run under
`--reuse-db`) may have already changed it.

Fixture setup goes through the auth_bypass_rls alias throughout — see
finance/tests/test_finance.py's module docstring for why, under
`transaction=True`, this is what's needed.
"""

import uuid

import pytest
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from common.context import apply_org_context
from foundation.models import Organization, Role, Setting, User, UserRole
from foundation.services import (
    DEFAULT_EMAIL_SETTINGS,
    DEFAULT_GENERAL_SETTINGS,
    DEFAULT_LANGUAGES_SETTINGS,
    DEFAULT_SECURITY_SETTINGS,
    DEFAULT_SMS_SETTINGS,
    DEFAULT_THEME_SETTINGS,
)

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _make_org(**kwargs):
    org_id = uuid.uuid4()
    kwargs.setdefault("name", "Org")
    kwargs.setdefault("slug", f"org-platform-settings-test-{uuid.uuid4().hex[:8]}")
    kwargs.setdefault("email", "a@example.com")
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(id=org_id, **kwargs)


def _set_security(**overrides):
    Setting.objects.using(BYPASS_ALIAS).update_or_create(
        scope="platform", organization=None, branch=None, user=None, key="security",
        defaults={"value": {**DEFAULT_SECURITY_SETTINGS, **overrides}},
    )


def _make_super_admin_login(client, org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="Super", last_name="Admin", password="pw123456", phone=phone, status="active",
    )
    system_role = Role.objects.using(BYPASS_ALIAS).filter(organization__isnull=True, slug="super_admin").first()
    if system_role is None:
        system_role = Role.objects.using(BYPASS_ALIAS).create(
            organization=None, name="Super Admin", slug="super_admin", is_system=True
        )
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=system_role, organization=org)
    response = client.post("/api/v1/auth/login/", {"login_id": user.login_id, "password": "pw123456"}, format="json")
    assert response.status_code == 200
    return user


def _make_login(org, phone, role_slug, password="pw123456"):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="U", last_name=phone[-4:], password=password, phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug=role_slug)
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    return user


def _login(client, user, password="pw123456"):
    response = client.post("/api/v1/auth/login/", {"login_id": user.login_id, "password": password}, format="json")
    assert response.status_code == 200
    return response


def test_platform_settings_has_general_and_security_keys():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900820001")

    response = client.get("/api/v1/settings/platform/")

    assert response.status_code == 200
    body = response.json()["data"]
    assert set(DEFAULT_GENERAL_SETTINGS) <= set(body["general"])
    assert set(DEFAULT_SECURITY_SETTINGS) <= set(body["security"])


def test_super_admin_can_update_general_settings():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900820002")

    response = client.put(
        "/api/v1/settings/platform/",
        {"general": {"platformName": "Acme LMS", "tagline": "Learn faster", "supportEmail": "help@acme.example"}},
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["data"]["general"]["platformName"] == "Acme LMS"

    check = client.get("/api/v1/settings/platform/")
    assert check.json()["data"]["general"]["platformName"] == "Acme LMS"


def test_partial_general_update_does_not_wipe_other_fields():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900820003")

    client.put(
        "/api/v1/settings/platform/",
        {"general": {"platformName": "First Name", "tagline": "Original tagline", "supportEmail": "a@example.com"}},
        format="json",
    )

    # Only platformName changes on this call — tagline/supportEmail must
    # survive, since PlatformSettingsView.put() merges into the current
    # value rather than replacing it outright.
    response = client.put("/api/v1/settings/platform/", {"general": {"platformName": "Second Name"}}, format="json")

    assert response.status_code == 200
    body = response.json()["data"]["general"]
    assert body["platformName"] == "Second Name"
    assert body["tagline"] == "Original tagline"
    assert body["supportEmail"] == "a@example.com"


def test_invalid_security_payload_rolls_back_a_valid_general_write_in_the_same_request():
    """Both panels are validated up front, before either is written — a bad
    security payload alongside a valid general one must leave general
    untouched too, not partially save it (PlatformSettingsView.put() wraps
    the whole method in @transaction.atomic)."""
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900820009")
    original = client.get("/api/v1/settings/platform/").json()["data"]["general"]["platformName"]

    response = client.put(
        "/api/v1/settings/platform/",
        {"general": {"platformName": "Should Not Persist"}, "security": {"maxLoginAttempts": "not-a-number"}},
        format="json",
    )

    assert response.status_code == 400
    check = client.get("/api/v1/settings/platform/")
    assert check.json()["data"]["general"]["platformName"] == original


@pytest.mark.parametrize(
    "payload",
    [
        {"maxLoginAttempts": "5"},
        {"maxLoginAttempts": -1},
        {"sessionTimeoutMinutes": 0},
        {"sessionTimeoutMinutes": "60"},
        {"twoFactor": "yes"},
        {"passwordPolicy": "unbreakable"},
    ],
)
def test_security_settings_reject_malformed_values(payload):
    """Real type/value validation, not just 'is this a dict' — a bad value
    here would otherwise be stored and later crash LoginView's lockout
    check or password_policy.validate_password_policy for every request
    platform-wide, not just this endpoint."""
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900820010")

    response = client.put("/api/v1/settings/platform/", {"security": payload}, format="json")

    assert response.status_code == 400


def test_login_lockout_does_not_apply_across_different_ip_addresses():
    """A lockout keyed on login_id alone would let anyone who merely knows
    a victim's login_id lock them out from a *different* IP — scoped by
    (login_id, ip_address) instead, so the victim's own attempts, from
    their own IP, are unaffected."""
    _set_security(maxLoginAttempts=5)
    org = _make_org()
    user = _make_login(org, "+998900820011", "teacher")
    attacker_client = APIClient()
    for _ in range(5):
        attacker_client.post(
            "/api/v1/auth/login/", {"login_id": user.login_id, "password": "wrong-password"},
            format="json", REMOTE_ADDR="10.0.0.99",
        )

    victim_client = APIClient()
    response = victim_client.post(
        "/api/v1/auth/login/", {"login_id": user.login_id, "password": "pw123456"},
        format="json", REMOTE_ADDR="10.0.0.1",
    )

    assert response.status_code == 200


def test_center_admin_cannot_view_or_update_platform_settings():
    org = _make_org()
    admin = _make_login(org, "+998900820004", "center_admin")
    client = APIClient()
    _login(client, admin)

    get_response = client.get("/api/v1/settings/platform/")
    put_response = client.put("/api/v1/settings/platform/", {"general": {"platformName": "Hijacked"}}, format="json")

    assert get_response.status_code == 403
    assert put_response.status_code == 403


def test_platform_branding_is_public_and_reflects_saved_general_settings():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900820005")
    client.put(
        "/api/v1/settings/platform/",
        {"general": {"platformName": "Branding Test Co", "tagline": "T", "supportEmail": "a@example.com"}},
        format="json",
    )

    # A fresh, never-authenticated client — the login page's own scenario.
    anonymous_client = APIClient()
    response = anonymous_client.get("/api/v1/settings/platform/branding/")

    assert response.status_code == 200
    assert response.json()["data"]["platformName"] == "Branding Test Co"
    # Only the public-facing subset — never security config.
    assert "security" not in response.json()["data"]
    assert "maxLoginAttempts" not in response.json()["data"]


def test_password_policy_basic_rejects_a_short_password():
    _set_security(passwordPolicy="basic")
    org = _make_org()
    user = _make_login(org, "+998900820006", "teacher")
    client = APIClient()
    _login(client, user)

    response = client.patch(
        f"/api/v1/users/{user.id}/", {"password": "short1", "current_password": "pw123456"}, format="json"
    )

    assert response.status_code == 400


def test_password_policy_strong_rejects_password_without_special_character():
    _set_security(passwordPolicy="strong")
    org = _make_org()
    user = _make_login(org, "+998900820007", "teacher")
    client = APIClient()
    _login(client, user)

    response = client.patch(
        f"/api/v1/users/{user.id}/",
        {"password": "abcdefghijkl123", "current_password": "pw123456"},  # 15 chars, no special char
        format="json",
    )

    assert response.status_code == 400


def test_password_policy_strong_accepts_a_qualifying_password():
    _set_security(passwordPolicy="strong")
    org = _make_org()
    user = _make_login(org, "+998900820008", "teacher")
    client = APIClient()
    _login(client, user)

    response = client.patch(
        f"/api/v1/users/{user.id}/",
        {"password": "abcdefghijkl!23", "current_password": "pw123456"},
        format="json",
    )

    assert response.status_code == 200


# ─── Theme/Languages/Email/SMS — 2026-08-25's "make the mock panels real" ──


def test_platform_settings_now_has_theme_languages_email_and_sms_keys():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900820012")

    body = client.get("/api/v1/settings/platform/").json()["data"]

    assert set(DEFAULT_THEME_SETTINGS) <= set(body["theme"])
    assert set(DEFAULT_LANGUAGES_SETTINGS) <= set(body["languages"])
    assert set(body["email"]) == {"smtpHost", "smtpPort", "username", "fromName", "tlsEnabled", "hasPassword"}
    assert set(body["sms"]) == {"provider", "accountSid", "fromNumber", "enabled", "hasAuthToken"}


def test_email_password_is_never_echoed_back_and_survives_a_password_less_save():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900820013")

    client.put(
        "/api/v1/settings/platform/",
        {"email": {**DEFAULT_EMAIL_SETTINGS, "smtpHost": "smtp.example.com", "password": "s3cr3t"}},
        format="json",
    )
    first_get = client.get("/api/v1/settings/platform/").json()["data"]["email"]
    assert "password" not in first_get
    assert first_get["hasPassword"] is True

    # Saving the rest of the panel again without retyping the password (the
    # real GET response never contains it to prefill) must not wipe it —
    # sanitize_platform_setting_incoming()'s whole point.
    client.put(
        "/api/v1/settings/platform/",
        {"email": {**DEFAULT_EMAIL_SETTINGS, "smtpHost": "smtp.example.com", "password": "", "fromName": "New Name"}},
        format="json",
    )
    stored = Setting.objects.using(BYPASS_ALIAS).get(scope="platform", key="email").value
    assert stored["password"] == "s3cr3t"
    assert stored["fromName"] == "New Name"


def test_sms_auth_token_is_never_echoed_back():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900820014")

    client.put(
        "/api/v1/settings/platform/",
        {"sms": {**DEFAULT_SMS_SETTINGS, "accountSid": "AC123", "authToken": "tok123"}},
        format="json",
    )
    body = client.get("/api/v1/settings/platform/").json()["data"]["sms"]

    assert "authToken" not in body
    assert body["hasAuthToken"] is True


@pytest.mark.parametrize(
    "payload",
    [
        {"primaryColor": "not-a-color"},
        {"fontFamily": "comic-sans"},
        {"darkMode": "yes"},
    ],
)
def test_theme_settings_reject_malformed_values(payload):
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900820015")

    response = client.put("/api/v1/settings/platform/", {"theme": payload}, format="json")

    assert response.status_code == 400


@pytest.mark.parametrize(
    "payload",
    [
        {"enabled": ["en", "fr"]},  # fr has no translations
        {"enabled": []},  # must stay non-empty
        {"default": "ru", "enabled": ["en", "uz"]},  # default must be in enabled
    ],
)
def test_languages_settings_reject_malformed_values(payload):
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900820016")

    response = client.put("/api/v1/settings/platform/", {"languages": payload}, format="json")

    assert response.status_code == 400


def test_platform_branding_now_includes_theme():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900820017")
    client.put("/api/v1/settings/platform/", {"theme": {"primaryColor": "#123456"}}, format="json")

    response = APIClient().get("/api/v1/settings/platform/branding/")

    assert response.status_code == 200
    assert response.json()["data"]["theme"]["primaryColor"] == "#123456"


# ─── Region settings (Admin/Teacher/Student Settings' Region tab) ─────────
# See test_region_settings.py for the dedicated MyRegionSettingsView suite —
# these two just confirm PlatformSettingsView's RBAC gate is untouched by
# the new panels (still 403 for a non-super-admin, still 200 with every key
# for a super-admin), which the tests above already exercise indirectly.


# ─── Email/SMS test-send ────────────────────────────────────────────────────
# No real SMTP server / Twilio account exists in the test environment, so
# these only exercise the parts that don't need one: permission gating and
# the "nothing configured yet" early-return path — see
# foundation.services.send_test_email/send_test_sms's own docstrings for
# why a provider-side failure is a normal (ok=False), not a 500.


def test_center_admin_cannot_send_test_email_or_sms():
    org = _make_org()
    admin = _make_login(org, "+998900820018", "center_admin")
    client = APIClient()
    _login(client, admin)

    assert client.post("/api/v1/settings/platform/email/test/", {"to": "a@example.com"}, format="json").status_code == 403
    assert client.post("/api/v1/settings/platform/sms/test/", {"to": "+998900000000"}, format="json").status_code == 403


def test_test_email_without_smtp_host_configured_fails_cleanly():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900820019")

    response = client.post("/api/v1/settings/platform/email/test/", {"to": "a@example.com"}, format="json")

    # 200, not a 500 — an unconfigured/failed send is a normal, displayable
    # result, not a request-level error.
    assert response.status_code == 200
    assert response.json()["success"] is False


def test_test_sms_without_twilio_configured_fails_cleanly():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900820020")
    client.put("/api/v1/settings/platform/", {"sms": {**DEFAULT_SMS_SETTINGS, "enabled": True}}, format="json")

    response = client.post("/api/v1/settings/platform/sms/test/", {"to": "+998900000000"}, format="json")

    assert response.status_code == 200
    assert response.json()["success"] is False
