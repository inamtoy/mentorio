"""Super-Admin Settings' API Keys panel — foundation.services.generate_api_key()/
rotate_api_key() and ApiKeyViewSet. Same fixture-setup style as
test_platform_settings.py.
"""

import uuid

import pytest
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from common.context import apply_org_context
from foundation.models import ApiKey, Organization, Role, User, UserRole

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _make_org(**kwargs):
    org_id = uuid.uuid4()
    kwargs.setdefault("name", "Org")
    kwargs.setdefault("slug", f"org-api-key-test-{uuid.uuid4().hex[:8]}")
    kwargs.setdefault("email", "a@example.com")
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(id=org_id, **kwargs)


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


def test_center_admin_cannot_list_or_create_api_keys():
    org = _make_org()
    admin = _make_login(org, "+998900850001", "center_admin")
    client = APIClient()
    _login(client, admin)

    assert client.get("/api/v1/settings/api-keys/").status_code == 403
    assert client.post("/api/v1/settings/api-keys/", {"name": "Hijack Key"}, format="json").status_code == 403


def test_super_admin_can_create_a_key_and_the_raw_secret_is_shown_only_once():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900850002")

    create_response = client.post("/api/v1/settings/api-keys/", {"name": "Production Key"}, format="json")

    assert create_response.status_code == 201
    created = create_response.json()["data"]
    assert created["key"].startswith("mk_live_")
    assert created["key_prefix"] == created["key"][:16]

    list_response = client.get("/api/v1/settings/api-keys/")
    listed = next(row for row in list_response.json()["data"] if row["id"] == created["id"])
    assert "key" not in listed
    assert listed["key_prefix"] == created["key_prefix"]
    assert listed["is_revoked"] is False


def test_raw_key_hashes_to_the_stored_key_hash():
    import hashlib

    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900850003")
    created = client.post("/api/v1/settings/api-keys/", {"name": "Webhook Secret"}, format="json").json()["data"]

    stored = ApiKey.objects.using(BYPASS_ALIAS).get(id=created["id"])

    assert stored.key_hash == hashlib.sha256(created["key"].encode()).hexdigest()


def test_revoke_soft_revokes_rather_than_deleting():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900850004")
    created = client.post("/api/v1/settings/api-keys/", {"name": "Sandbox Key"}, format="json").json()["data"]

    revoke_response = client.delete(f"/api/v1/settings/api-keys/{created['id']}/")

    assert revoke_response.status_code == 200
    listed = next(row for row in client.get("/api/v1/settings/api-keys/").json()["data"] if row["id"] == created["id"])
    assert listed["is_revoked"] is True
    assert listed["revoked_at"] is not None


def test_rotate_revokes_the_old_key_and_issues_a_new_one_with_the_same_name():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900850005")
    original = client.post("/api/v1/settings/api-keys/", {"name": "CI Key"}, format="json").json()["data"]

    rotate_response = client.post(f"/api/v1/settings/api-keys/{original['id']}/rotate/")

    assert rotate_response.status_code == 201
    rotated = rotate_response.json()["data"]
    assert rotated["name"] == "CI Key"
    assert rotated["key"] != original["key"]
    assert rotated["id"] != original["id"]

    rows = {row["id"]: row for row in client.get("/api/v1/settings/api-keys/").json()["data"]}
    assert rows[original["id"]]["is_revoked"] is True
    assert rows[rotated["id"]]["is_revoked"] is False


def test_creating_a_key_without_a_name_is_rejected():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900850006")

    response = client.post("/api/v1/settings/api-keys/", {"name": "  "}, format="json")

    assert response.status_code == 400
