"""Admin-side password reset and the forced change that follows it.

Same real-login fixture style as test_user_self_update.py.
"""

import uuid

import pytest
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from auth_custom.models import Session
from common.context import apply_org_context
from foundation.models import AuditLog, Organization, Role, User, UserRole

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _make_org():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-pw-change-test-{uuid.uuid4().hex[:8]}", email="a@example.com"
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
    assert response.status_code == 200, response.json()
    return response


def test_admin_reset_returns_one_time_password_and_ends_target_sessions():
    org = _make_org()
    admin = _make_login(org, "+998900600001", "center_admin")
    student = _make_login(org, "+998900600002", "student")
    student_client = APIClient()
    _login(student_client, student)

    admin_client = APIClient()
    _login(admin_client, admin)
    response = admin_client.post(f"/api/v1/users/{student.id}/reset-password/")

    assert response.status_code == 200, response.json()
    temporary = response.json()["data"]["temporary_password"]
    student.refresh_from_db(using=BYPASS_ALIAS)
    assert student.check_password(temporary)
    assert student.must_change_password is True
    assert not Session.objects.using(BYPASS_ALIAS).filter(user=student, is_active=True).exists()
    assert AuditLog.objects.using(BYPASS_ALIAS).filter(
        entity_id=str(student.id), metadata__via="admin_reset"
    ).exists()


def test_reset_password_requires_administrators_update():
    org = _make_org()
    teacher = _make_login(org, "+998900600003", "teacher")
    student = _make_login(org, "+998900600004", "student")

    client = APIClient()
    _login(client, teacher)
    response = client.post(f"/api/v1/users/{student.id}/reset-password/")

    assert response.status_code == 403
    student.refresh_from_db(using=BYPASS_ALIAS)
    assert student.check_password("pw123456")


def test_admin_cannot_reset_own_password_through_admin_path():
    org = _make_org()
    admin = _make_login(org, "+998900600005", "center_admin")

    client = APIClient()
    _login(client, admin)

    assert client.post(f"/api/v1/users/{admin.id}/reset-password/").status_code == 403


def test_forced_change_blocks_everything_but_own_record_until_changed():
    org = _make_org()
    student = _make_login(org, "+998900600006", "student", password="Temp-pass-123")
    User.objects.using(BYPASS_ALIAS).filter(pk=student.pk).update(must_change_password=True)

    client = APIClient()
    login = _login(client, student, password="Temp-pass-123")
    assert login.json()["data"]["user"]["must_change_password"] is True

    blocked = client.get("/api/v1/auth/sessions/")
    assert blocked.status_code == 403
    assert blocked.json()["data"]["code"] == ["password_change_required"]
    assert client.get(f"/api/v1/users/{student.id}/").status_code == 200

    changed = client.patch(
        f"/api/v1/users/{student.id}/",
        {"password": "Own-choice-456", "current_password": "Temp-pass-123"},
        format="json",
    )
    assert changed.status_code == 200, changed.json()
    student.refresh_from_db(using=BYPASS_ALIAS)
    assert student.must_change_password is False
    # Same session keeps working — no forced re-login after your own change.
    assert client.get("/api/v1/auth/sessions/").status_code == 200


def test_self_change_signs_out_other_devices_but_not_this_one():
    org = _make_org()
    teacher = _make_login(org, "+998900600007", "teacher")
    other_device = APIClient()
    _login(other_device, teacher)
    this_device = APIClient()
    _login(this_device, teacher)

    response = this_device.patch(
        f"/api/v1/users/{teacher.id}/",
        {"password": "new-pass-789", "current_password": "pw123456"},
        format="json",
    )

    assert response.status_code == 200
    assert this_device.get(f"/api/v1/users/{teacher.id}/").status_code == 200
    assert other_device.get(f"/api/v1/users/{teacher.id}/").status_code == 401


def test_admin_setting_a_password_via_update_also_forces_change():
    org = _make_org()
    admin = _make_login(org, "+998900600008", "center_admin")
    teacher = _make_login(org, "+998900600009", "teacher")

    client = APIClient()
    _login(client, admin)
    response = client.patch(f"/api/v1/users/{teacher.id}/", {"password": "Admin-picked-1"}, format="json")

    assert response.status_code == 200, response.json()
    teacher.refresh_from_db(using=BYPASS_ALIAS)
    assert teacher.must_change_password is True
