"""Server-assigned student codes (StudentProfileSerializer.create, via
common.codegen.generate_sequential_code) and Uzbek phone validation
(auth_custom.services.phone.normalize_uz_phone) on the user and parent
endpoints the Admin student form writes to.

Same fixture style as test_student_profile_authorization.py.
"""

import uuid

import pytest
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from auth_custom.services.phone import normalize_uz_phone
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
            id=org_id, name="Org", slug=f"org-student-code-test-{uuid.uuid4().hex[:8]}", email="a@example.com"
        )


def _admin_client(org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="A", last_name=phone[-4:], password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="center_admin")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    client = APIClient()
    login = client.post("/api/v1/auth/login/", {"login_id": user.login_id, "password": "pw123456"}, format="json")
    assert login.status_code == 200
    return client


def _plain_user(org, phone):
    return User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="S", last_name=phone[-4:], password="pw123456", phone=phone,
    )


@pytest.mark.parametrize(
    "raw",
    ["+998 90 123-45-67", "998901234567", "901234567", "(90) 123 45 67"],
)
def test_normalize_uz_phone_accepts_common_spellings(raw):
    assert normalize_uz_phone(raw) == "+998901234567"


@pytest.mark.parametrize("raw", ["64456569898", "12345", "+7 701 123 45 67", ""])
def test_normalize_uz_phone_rejects_non_uzbek_numbers(raw):
    with pytest.raises(ValueError):
        normalize_uz_phone(raw)


def test_creating_a_user_stores_the_normalized_phone():
    org = _make_org()
    client = _admin_client(org, "+998940000001")

    response = client.post(
        "/api/v1/users/",
        {"organization": str(org.id), "first_name": "New", "last_name": "Student", "phone": "90 111 22 33", "password": "Student-pass-1"},
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["data"]["phone"] == "+998901112233"


def test_creating_a_user_with_an_invalid_phone_is_rejected():
    org = _make_org()
    client = _admin_client(org, "+998940000002")

    response = client.post(
        "/api/v1/users/",
        {"organization": str(org.id), "first_name": "New", "last_name": "Student", "phone": "64456569898", "password": "Student-pass-1"},
        format="json",
    )

    assert response.status_code == 400
    assert "phone" in response.json()["data"]


def test_parent_phone_is_normalized_and_validated():
    org = _make_org()
    client = _admin_client(org, "+998940000003")
    student = StudentProfile.objects.using(BYPASS_ALIAS).create(
        organization=org, user=_plain_user(org, "+998940000004"), student_code="STU-0001"
    )
    payload = {"organization": str(org.id), "student_profile": str(student.id), "relation": "mother", "first_name": "M", "last_name": "P"}

    bad = client.post("/api/v1/students/parents/", {**payload, "phone": "9070309"}, format="json")
    good = client.post("/api/v1/students/parents/", {**payload, "phone": "907030965"}, format="json")

    assert bad.status_code == 400
    assert good.status_code == 201
    assert good.json()["data"]["phone"] == "+998907030965"


def test_blank_student_code_gets_the_next_sequential_code():
    org = _make_org()
    client = _admin_client(org, "+998940000005")
    # Hand-typed codes that aren't STU-<digits> don't move the sequence.
    StudentProfile.objects.using(BYPASS_ALIAS).create(organization=org, user=_plain_user(org, "+998940000006"), student_code="EDU")
    StudentProfile.objects.using(BYPASS_ALIAS).create(organization=org, user=_plain_user(org, "+998940000007"), student_code="STU-0009")

    first = client.post(
        "/api/v1/students/",
        {"organization": str(org.id), "user": str(_plain_user(org, "+998940000008").id), "student_code": "", "enrollment_date": "2026-10-01"},
        format="json",
    )
    second = client.post(
        "/api/v1/students/",
        {"organization": str(org.id), "user": str(_plain_user(org, "+998940000009").id), "enrollment_date": "2026-10-01"},
        format="json",
    )

    assert first.status_code == 201, first.json()
    assert first.json()["data"]["student_code"] == "STU-0010"
    assert second.json()["data"]["student_code"] == "STU-0011"


def test_blank_student_code_on_update_keeps_the_current_code():
    org = _make_org()
    client = _admin_client(org, "+998940000010")
    student = StudentProfile.objects.using(BYPASS_ALIAS).create(
        organization=org, user=_plain_user(org, "+998940000011"), student_code="STU-0042"
    )

    response = client.patch(f"/api/v1/students/{student.id}/", {"student_code": "", "notes": "x"}, format="json")

    assert response.status_code == 200
    assert response.json()["data"]["student_code"] == "STU-0042"
