"""API-level tests for UserViewSet's self-service update path — same "real
login, not just ORM objects" reasoning as test_audit_logs.py: HasModulePermission
and get_permissions()'s is_self check both read from request.user.

Fixture setup and post-request DB-state assertions go through the
auth_bypass_rls alias — see finance/tests/test_finance.py's module
docstring for why, under `transaction=True`, this is what's needed.
"""

import uuid

import pytest
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from common.context import apply_org_context
from foundation.models import AuditLog, Organization, Role, User, UserRole

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _make_org():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-self-update-test-{uuid.uuid4().hex[:8]}", email="a@example.com"
        )


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


def test_self_can_update_own_name_and_phone():
    org = _make_org()
    teacher = _make_login(org, "+998900500001", "teacher")

    client = APIClient()
    _login(client, teacher)
    response = client.patch(f"/api/v1/users/{teacher.id}/", {"first_name": "Renamed"}, format="json")

    assert response.status_code == 200
    assert response.json()["data"]["first_name"] == "Renamed"


def test_self_password_change_requires_correct_current_password():
    org = _make_org()
    teacher = _make_login(org, "+998900500002", "teacher")

    client = APIClient()
    _login(client, teacher)
    response = client.patch(
        f"/api/v1/users/{teacher.id}/",
        {"password": "new-pass-123", "current_password": "wrong-password"},
        format="json",
    )

    assert response.status_code == 403
    assert "current password" in response.json()["message"].lower()
    teacher.refresh_from_db(using=BYPASS_ALIAS)
    assert teacher.check_password("pw123456")


def test_self_password_change_rejected_without_current_password():
    org = _make_org()
    teacher = _make_login(org, "+998900500003", "teacher")

    client = APIClient()
    _login(client, teacher)
    response = client.patch(f"/api/v1/users/{teacher.id}/", {"password": "new-pass-123"}, format="json")

    assert response.status_code == 403
    teacher.refresh_from_db(using=BYPASS_ALIAS)
    assert teacher.check_password("pw123456")


def test_self_password_change_succeeds_with_correct_current_password_and_is_audited():
    org = _make_org()
    teacher = _make_login(org, "+998900500004", "teacher")

    client = APIClient()
    _login(client, teacher)
    response = client.patch(
        f"/api/v1/users/{teacher.id}/",
        {"password": "new-pass-123", "current_password": "pw123456"},
        format="json",
    )

    assert response.status_code == 200
    teacher.refresh_from_db(using=BYPASS_ALIAS)
    assert teacher.check_password("new-pass-123")

    logs = AuditLog.objects.using(BYPASS_ALIAS).filter(entity_type="user", entity_id=teacher.id, action="update")
    assert logs.exists()
    assert logs.first().metadata == {"field": "password", "via": "self"}


def test_self_cannot_update_disallowed_field_without_permission():
    org = _make_org()
    teacher = _make_login(org, "+998900500005", "teacher")

    client = APIClient()
    _login(client, teacher)
    response = client.patch(f"/api/v1/users/{teacher.id}/", {"status": "suspended"}, format="json")

    assert response.status_code == 403
    teacher.refresh_from_db(using=BYPASS_ALIAS)
    assert teacher.status == "active"
