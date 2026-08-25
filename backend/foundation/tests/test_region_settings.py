"""MyRegionSettingsView — per-user timezone/dateFormat (Admin/Teacher/
Student Settings' Region tab). Self-service: unlike PlatformSettingsView,
any authenticated user manages their own row, no `platform_settings` RBAC
gate — same trust level as changing your own password. Same fixture-setup
style as test_platform_settings.py (BYPASSRLS alias throughout).
"""

import uuid

import pytest
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from common.context import apply_org_context
from foundation.models import Organization, Role, User, UserRole
from foundation.services import DEFAULT_REGION_SETTINGS

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _make_org(**kwargs):
    org_id = uuid.uuid4()
    kwargs.setdefault("name", "Org")
    kwargs.setdefault("slug", f"org-region-settings-test-{uuid.uuid4().hex[:8]}")
    kwargs.setdefault("email", "a@example.com")
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(id=org_id, **kwargs)


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


def test_defaults_before_ever_saving():
    org = _make_org()
    teacher = _make_login(org, "+998900830001", "teacher")
    client = APIClient()
    _login(client, teacher)

    response = client.get("/api/v1/settings/my-region/")

    assert response.status_code == 200
    assert response.json()["data"] == DEFAULT_REGION_SETTINGS


def test_a_plain_student_can_update_their_own_region_settings_no_rbac_needed():
    """Self-service, not gated by `platform_settings` — a student holds
    none of that permission and must still be able to save their own
    timezone/dateFormat preference."""
    org = _make_org()
    student = _make_login(org, "+998900830002", "student")
    client = APIClient()
    _login(client, student)

    response = client.put(
        "/api/v1/settings/my-region/", {"timezone": "Asia/Almaty", "dateFormat": "YYYY-MM-DD"}, format="json"
    )

    assert response.status_code == 200
    assert response.json()["data"]["timezone"] == "Asia/Almaty"
    assert response.json()["data"]["dateFormat"] == "YYYY-MM-DD"

    check = client.get("/api/v1/settings/my-region/")
    assert check.json()["data"]["timezone"] == "Asia/Almaty"


def test_region_settings_are_private_per_user():
    org = _make_org()
    teacher_a = _make_login(org, "+998900830003", "teacher")
    teacher_b = _make_login(org, "+998900830004", "teacher")
    client_a, client_b = APIClient(), APIClient()
    _login(client_a, teacher_a)
    _login(client_b, teacher_b)

    client_a.put("/api/v1/settings/my-region/", {"timezone": "Europe/Moscow"}, format="json")

    assert client_b.get("/api/v1/settings/my-region/").json()["data"]["timezone"] == DEFAULT_REGION_SETTINGS["timezone"]
    assert client_a.get("/api/v1/settings/my-region/").json()["data"]["timezone"] == "Europe/Moscow"


@pytest.mark.parametrize(
    "payload",
    [
        {"timezone": "Not/A_Real_Zone"},
        {"timezone": 123},
        {"dateFormat": "YYYY/MM/DD"},
    ],
)
def test_invalid_payloads_are_rejected(payload):
    org = _make_org()
    teacher = _make_login(org, "+998900830005", "teacher")
    client = APIClient()
    _login(client, teacher)

    response = client.put("/api/v1/settings/my-region/", payload, format="json")

    assert response.status_code == 400


def test_partial_update_does_not_wipe_the_other_field():
    org = _make_org()
    teacher = _make_login(org, "+998900830006", "teacher")
    client = APIClient()
    _login(client, teacher)
    client.put("/api/v1/settings/my-region/", {"timezone": "Asia/Dubai", "dateFormat": "MM/DD/YYYY"}, format="json")

    response = client.put("/api/v1/settings/my-region/", {"dateFormat": "DD/MM/YYYY"}, format="json")

    assert response.status_code == 200
    assert response.json()["data"]["timezone"] == "Asia/Dubai"
    assert response.json()["data"]["dateFormat"] == "DD/MM/YYYY"


def test_anonymous_request_is_rejected():
    response = APIClient().get("/api/v1/settings/my-region/")

    assert response.status_code == 401
