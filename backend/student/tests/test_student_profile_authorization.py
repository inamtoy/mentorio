"""API-level tests for the student-owns-profile check in
StudentProfileViewSet — see the matching comment in
student/views.py::StudentProfileViewSet.perform_update. Needs a real login
(not just ORM objects) since HasModulePermission + the ownership check both
read from request.user, and role/permission grants only exist once
foundation.signals's post_save provisioning has actually run.

Same fixture style as attendance/tests/test_attendance_authorization.py.
"""

import uuid

import pytest
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from common.context import apply_org_context
from foundation.models import Organization, Role, User, UserRole
from student.models import StudentProfile

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _make_org():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-student-profile-test-{uuid.uuid4().hex[:8]}", email="a@example.com"
        )


def _make_student_login(org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="S", last_name=phone[-4:], password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="student")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    profile = StudentProfile.objects.using(BYPASS_ALIAS).create(organization=org, user=user, student_code=f"STU-{phone[-4:]}")
    return user, profile


def _login(phone):
    client = APIClient()
    response = client.post("/api/v1/auth/login/", {"login_id": phone, "password": "pw123456"}, format="json")
    assert response.status_code == 200
    return client


def test_student_can_update_own_profile():
    org = _make_org()
    student_user, student = _make_student_login(org, "+998930000001")

    client = _login(student_user.login_id)
    response = client.patch(f"/api/v1/students/{student.id}/", {"education_level": "Grade 10"}, format="json")

    assert response.status_code == 200
    assert response.json()["data"]["education_level"] == "Grade 10"


def test_student_cannot_update_another_students_profile():
    org = _make_org()
    student_a_user, _student_a = _make_student_login(org, "+998930000002")
    _student_b_user, student_b = _make_student_login(org, "+998930000003")

    client = _login(student_a_user.login_id)
    response = client.patch(f"/api/v1/students/{student_b.id}/", {"education_level": "Grade 11"}, format="json")

    assert response.status_code == 403
