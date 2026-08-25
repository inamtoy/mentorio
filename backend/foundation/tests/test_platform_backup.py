"""Super-Admin Settings' Backup panel — foundation.services.run_platform_backup()
and the PlatformBackupListView/PlatformBackupDownloadView pair. Same
fixture-setup style as test_platform_settings.py.

The "happy path" test is a real `pg_dump` run against the actual
`test_educore_test` database (django's test runner points
`DATABASES["default"]` at it for the duration of the run) — skipped, not
failed, on a machine/CI image without `pg_dump` on PATH, since this
feature's whole point is a genuine dump, not a mocked one.
"""

import shutil
import uuid

import pytest
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from common.context import apply_org_context
from foundation.models import Organization, PlatformBackup, Role, User, UserRole

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _make_org(**kwargs):
    org_id = uuid.uuid4()
    kwargs.setdefault("name", "Org")
    kwargs.setdefault("slug", f"org-backup-test-{uuid.uuid4().hex[:8]}")
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


def test_center_admin_cannot_list_or_run_backups():
    org = _make_org()
    admin = _make_login(org, "+998900840001", "center_admin")
    client = APIClient()
    _login(client, admin)

    assert client.get("/api/v1/settings/backups/").status_code == 403
    assert client.post("/api/v1/settings/backups/").status_code == 403


@pytest.mark.skipif(shutil.which("pg_dump") is None, reason="pg_dump not on PATH in this environment")
def test_super_admin_can_run_a_real_backup_and_download_it():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900840002")

    run_response = client.post("/api/v1/settings/backups/")

    assert run_response.status_code == 201, run_response.json()
    data = run_response.json()["data"]
    assert data["status"] == "success"
    assert data["size_bytes"] > 0

    list_response = client.get("/api/v1/settings/backups/")
    assert any(row["id"] == data["id"] for row in list_response.json()["data"])

    download_response = client.get(f"/api/v1/settings/backups/{data['id']}/download/")
    assert download_response.status_code == 200
    assert download_response["Content-Disposition"].startswith("attachment;")


def test_backup_records_a_real_failure_when_pg_dump_is_missing(monkeypatch):
    """No task queue, no mocked "success" — if pg_dump can't be found, the
    row must say so, not silently pretend the backup worked."""
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900840003")
    monkeypatch.setattr("foundation.services.shutil.which", lambda _name: None)

    response = client.post("/api/v1/settings/backups/")

    assert response.status_code == 502
    assert response.json()["data"]["status"] == "failed"
    assert "PATH" in response.json()["data"]["error_message"]
    assert PlatformBackup.objects.using(BYPASS_ALIAS).get(id=response.json()["data"]["id"]).status == "failed"


def test_download_of_a_nonexistent_backup_404s():
    org = _make_org()
    client = APIClient()
    _make_super_admin_login(client, org, "+998900840004")

    response = client.get(f"/api/v1/settings/backups/{uuid.uuid4()}/download/")

    assert response.status_code == 404
