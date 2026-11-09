"""API-level tests for TeacherSalaryViewSet's authorization — see
foundation/permissions_catalog.py's "teacher_salary" docstring note for the
bug this closes: TeacherSalaryViewSet used to reuse the `teachers`
permission_map, so any teacher (module-wide `teachers:view`/`teachers:update`)
could list every other teacher's salary and PATCH any teacher's salary row,
including their own. Needs a real login (not just ORM objects) since
HasModulePermission + get_queryset() both read from request.user, and
role/permission grants only exist once foundation.signals's post_save
provisioning has actually run.

Fixture setup goes through the auth_bypass_rls alias throughout — see
finance/tests/test_finance.py's module docstring for why, under
`transaction=True`, this is what's needed.
"""

import uuid

import pytest
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from common.context import apply_org_context
from foundation.models import Organization, Role, User, UserRole
from teacher.models import TeacherProfile, TeacherSalary

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _make_org():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-salary-test-{uuid.uuid4().hex[:8]}", email="a@example.com"
        )


def _make_teacher_login(org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="T", last_name=phone[-4:], password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="teacher")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    profile = TeacherProfile.objects.using(BYPASS_ALIAS).create(organization=org, user=user, teacher_code=f"TCH-{phone[-9:]}")
    return user, profile


def _make_admin_login(org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="A", last_name=phone[-4:], password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="center_admin")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    return user


def _login(client, user):
    response = client.post("/api/v1/auth/login/", {"login_id": user.login_id, "password": "pw123456"}, format="json")
    assert response.status_code == 200
    return response


def _make_salary(org, teacher_profile, **kwargs):
    kwargs.setdefault("salary_type", "fixed")
    kwargs.setdefault("amount", "5000000")
    kwargs.setdefault("effective_from", "2026-01-01")
    return TeacherSalary.objects.using(BYPASS_ALIAS).create(organization=org, teacher_profile=teacher_profile, **kwargs)


def test_teacher_can_view_own_salary():
    org = _make_org()
    teacher_user, teacher_profile = _make_teacher_login(org, "+998900500001")
    _make_salary(org, teacher_profile, amount="4000000")

    client = APIClient()
    _login(client, teacher_user)
    response = client.get("/api/v1/teachers/salaries/")
    assert response.status_code == 200
    rows = response.json()["data"]["results"]
    assert len(rows) == 1
    assert rows[0]["teacher_profile"] == str(teacher_profile.id)


def test_teacher_cannot_see_another_teachers_salary_in_list():
    org = _make_org()
    teacher_a_user, teacher_a = _make_teacher_login(org, "+998900500002")
    _teacher_b_user, teacher_b = _make_teacher_login(org, "+998900500003")
    _make_salary(org, teacher_b, amount="9000000")

    client = APIClient()
    _login(client, teacher_a_user)
    response = client.get("/api/v1/teachers/salaries/")
    assert response.status_code == 200
    assert response.json()["data"]["results"] == []


def test_teacher_cannot_retrieve_another_teachers_salary_by_id():
    org = _make_org()
    teacher_a_user, _teacher_a = _make_teacher_login(org, "+998900500004")
    _teacher_b_user, teacher_b = _make_teacher_login(org, "+998900500005")
    salary_b = _make_salary(org, teacher_b, amount="9000000")

    client = APIClient()
    _login(client, teacher_a_user)
    response = client.get(f"/api/v1/teachers/salaries/{salary_b.id}/")
    assert response.status_code == 404


def test_teacher_cannot_create_salary():
    org = _make_org()
    teacher_user, teacher_profile = _make_teacher_login(org, "+998900500006")

    client = APIClient()
    _login(client, teacher_user)
    response = client.post(
        "/api/v1/teachers/salaries/",
        {
            "organization": str(org.id),
            "teacher_profile": str(teacher_profile.id),
            "salary_type": "fixed",
            "amount": "10000000",
            "effective_from": "2026-01-01",
        },
        format="json",
    )
    assert response.status_code == 403


def test_teacher_cannot_update_own_salary():
    """The bug this test guards against: before the fix, `teachers:update`
    (granted so a teacher can edit their own profile bio) also authorized
    PATCHing TeacherSalaryViewSet, since it reused the same permission_map —
    letting a teacher give themselves a raise.
    """
    org = _make_org()
    teacher_user, teacher_profile = _make_teacher_login(org, "+998900500007")
    salary = _make_salary(org, teacher_profile, amount="5000000")

    client = APIClient()
    _login(client, teacher_user)
    response = client.patch(f"/api/v1/teachers/salaries/{salary.id}/", {"amount": "50000000"}, format="json")
    assert response.status_code == 403


def test_center_admin_can_list_and_manage_all_salaries():
    org = _make_org()
    admin_user = _make_admin_login(org, "+998900500008")
    _teacher_a_user, teacher_a = _make_teacher_login(org, "+998900500009")
    _teacher_b_user, teacher_b = _make_teacher_login(org, "+998900500010")
    _make_salary(org, teacher_a, amount="4000000")
    _make_salary(org, teacher_b, amount="6000000")

    client = APIClient()
    _login(client, admin_user)

    response = client.get("/api/v1/teachers/salaries/")
    assert response.status_code == 200
    assert len(response.json()["data"]["results"]) == 2

    create_response = client.post(
        "/api/v1/teachers/salaries/",
        {
            "organization": str(org.id),
            "teacher_profile": str(teacher_a.id),
            "salary_type": "hourly",
            "amount": "50000",
            "effective_from": "2026-02-01",
        },
        format="json",
    )
    assert create_response.status_code == 201


def test_activating_new_salary_deactivates_previous_active_row():
    """TeacherSalary.__doc__: only one row should be is_active per teacher at
    a time — TeacherSalaryViewSet.perform_create/perform_update is what's
    supposed to enforce that (see the comment there), since there's no DB
    constraint for it.
    """
    org = _make_org()
    admin_user = _make_admin_login(org, "+998900500011")
    _teacher_user, teacher_profile = _make_teacher_login(org, "+998900500012")
    old_salary = _make_salary(org, teacher_profile, amount="4000000", is_active=True)

    client = APIClient()
    _login(client, admin_user)
    response = client.post(
        "/api/v1/teachers/salaries/",
        {
            "organization": str(org.id),
            "teacher_profile": str(teacher_profile.id),
            "salary_type": "fixed",
            "amount": "6000000",
            "effective_from": "2026-03-01",
            "is_active": True,
        },
        format="json",
    )
    assert response.status_code == 201
    new_salary_id = response.json()["data"]["id"]

    old_salary.refresh_from_db()
    assert old_salary.is_active is False
    assert TeacherSalary.objects.using(BYPASS_ALIAS).get(id=new_salary_id).is_active is True


def test_deactivating_a_salary_does_not_touch_others():
    """Saving with is_active=False must not deactivate unrelated active
    rows for other teachers — _deactivate_other_active_rows is scoped to
    instance.teacher_profile.
    """
    org = _make_org()
    admin_user = _make_admin_login(org, "+998900500013")
    _teacher_a_user, teacher_a = _make_teacher_login(org, "+998900500014")
    _teacher_b_user, teacher_b = _make_teacher_login(org, "+998900500015")
    salary_a = _make_salary(org, teacher_a, amount="4000000", is_active=True)
    salary_b = _make_salary(org, teacher_b, amount="5000000", is_active=True)

    client = APIClient()
    _login(client, admin_user)
    response = client.patch(f"/api/v1/teachers/salaries/{salary_a.id}/", {"is_active": False}, format="json")
    assert response.status_code == 200

    salary_b.refresh_from_db()
    assert salary_b.is_active is True
