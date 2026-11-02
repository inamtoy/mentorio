"""A teacher's `teachers:update` covers only a few fields of their own
profile — see teacher/views.py::TEACHER_SELF_EDITABLE_FIELDS and
TeacherSubResourceWriteMixin. Before, it let a teacher edit any colleague's
specializations/availability/documents and their own status/branch.
"""

import uuid

import pytest
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from common.context import apply_org_context
from foundation.models import Organization, Role, User, UserRole
from teacher.models import TeacherDocument, TeacherProfile, TeacherSpecialization

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _make_org():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-teacher-self-{uuid.uuid4().hex[:8]}", email="a@example.com"
        )


def _make_user(org, phone, role_slug):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="U", last_name=phone[-4:], password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug=role_slug)
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    return user


def _make_teacher(org, phone):
    user = _make_user(org, phone, "teacher")
    profile = TeacherProfile.objects.using(BYPASS_ALIAS).create(organization=org, user=user, teacher_code=f"TCH-{phone[-4:]}")
    return user, profile


def _login(user):
    client = APIClient()
    response = client.post("/api/v1/auth/login/", {"login_id": user.login_id, "password": "pw123456"}, format="json")
    assert response.status_code == 200, response.content
    return client


def test_teacher_can_edit_their_own_bio():
    org = _make_org()
    user, me = _make_teacher(org, "+998932000001")

    response = _login(user).patch(f"/api/v1/teachers/{me.id}/", {"bio": "Math teacher", "experience_years": 5}, format="json")

    assert response.status_code == 200
    assert response.json()["data"]["bio"] == "Math teacher"


def test_teacher_cannot_change_their_own_status():
    org = _make_org()
    user, me = _make_teacher(org, "+998932000002")

    response = _login(user).patch(f"/api/v1/teachers/{me.id}/", {"status": "terminated"}, format="json")

    assert response.status_code == 403


def test_teacher_cannot_edit_a_colleagues_specialization():
    org = _make_org()
    user, _me = _make_teacher(org, "+998932000003")
    _other_user, other = _make_teacher(org, "+998932000004")
    spec = TeacherSpecialization.objects.using(BYPASS_ALIAS).create(organization=org, teacher_profile=other, subject_name="Physics")

    client = _login(user)
    patch = client.patch(f"/api/v1/teachers/specializations/{spec.id}/", {"subject_name": "Hacked"}, format="json")
    delete = client.delete(f"/api/v1/teachers/specializations/{spec.id}/")

    assert (patch.status_code, delete.status_code) == (403, 403)
    spec.refresh_from_db(using=BYPASS_ALIAS)
    assert spec.subject_name == "Physics" and spec.deleted_at is None


def test_teacher_sees_only_their_own_documents():
    org = _make_org()
    user, me = _make_teacher(org, "+998932000005")
    _other_user, other = _make_teacher(org, "+998932000006")
    mine = TeacherDocument.objects.using(BYPASS_ALIAS).create(organization=org, teacher_profile=me, document_type="passport", title="Mine")
    TeacherDocument.objects.using(BYPASS_ALIAS).create(organization=org, teacher_profile=other, document_type="passport", title="Theirs")

    response = _login(user).get("/api/v1/teachers/documents/")

    assert response.status_code == 200
    assert {row["id"] for row in response.json()["data"]["results"]} == {str(mine.id)}


def test_center_admin_can_edit_any_teacher():
    org = _make_org()
    admin = _make_user(org, "+998932000010", "center_admin")
    _user, teacher = _make_teacher(org, "+998932000011")

    response = _login(admin).patch(f"/api/v1/teachers/{teacher.id}/", {"status": "inactive"}, format="json")

    assert response.status_code == 200
