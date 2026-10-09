"""API-level tests for finance.PayrollViewSet: CRUD, status transitions,
period/uniqueness validation, and org isolation. Real login (not just ORM
objects) — HasModulePermission reads from request.user. Fixture setup goes
through the auth_bypass_rls alias, same reasoning as
finance/tests/test_finance.py's module docstring.
"""

import uuid

import pytest
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from common.context import apply_org_context
from finance.models import Payroll
from foundation.models import Organization, Role, User, UserRole
from teacher.models import TeacherProfile

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _make_org():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-payroll-test-{uuid.uuid4().hex[:8]}", email="a@example.com"
        )


def _make_admin_login(client, org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="A", last_name="Admin", password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="center_admin")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    response = client.post("/api/v1/auth/login/", {"login_id": user.login_id, "password": "pw123456"}, format="json")
    assert response.status_code == 200
    return user


def _make_teacher(org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="T", last_name="Teacher", password="pw123456", phone=phone, status="active",
    )
    return TeacherProfile.objects.using(BYPASS_ALIAS).create(
        organization=org, user=user, teacher_code=f"TCH-{phone[-4:]}"
    )


def _make_payroll(org, teacher_profile, **kwargs):
    kwargs.setdefault("period_start", "2026-09-01")
    kwargs.setdefault("period_end", "2026-09-30")
    kwargs.setdefault("base_salary", "8000000.00")
    payroll = Payroll.objects.using(BYPASS_ALIAS).create(organization=org, teacher_profile=teacher_profile, **kwargs)
    payroll.refresh_from_db(using=BYPASS_ALIAS)
    return payroll


def test_center_admin_can_create_and_list_payroll():
    org = _make_org()
    teacher = _make_teacher(org, "+998900700001")
    client = APIClient()
    _make_admin_login(client, org, "+998900700002")

    response = client.post(
        "/api/v1/finance/payroll/",
        {
            "organization": str(org.id), "teacher_profile": str(teacher.id),
            "period_start": "2026-09-01", "period_end": "2026-09-30",
            "base_salary": "8000000.00", "bonus": "500000.00", "tax_amount": "1020000.00",
        },
        format="json",
    )
    assert response.status_code == 201
    body = response.json()["data"]
    assert body["status"] == "draft"
    # SerializerMethodField serializes a raw Decimal as a JSON float, same
    # as Invoice.paid_amount/balance's existing SerializerMethodField —
    # unlike a real model DecimalField, which DRF auto-stringifies.
    assert body["net_amount"] == 7480000.0

    response = client.get("/api/v1/finance/payroll/")
    assert response.status_code == 200
    assert len(response.json()["data"]["results"]) == 1


def test_duplicate_payroll_period_rejected():
    org = _make_org()
    teacher = _make_teacher(org, "+998900700003")
    client = APIClient()
    _make_admin_login(client, org, "+998900700004")
    _make_payroll(org, teacher)

    response = client.post(
        "/api/v1/finance/payroll/",
        {
            "organization": str(org.id), "teacher_profile": str(teacher.id),
            "period_start": "2026-09-01", "period_end": "2026-09-30", "base_salary": "8000000.00",
        },
        format="json",
    )
    assert response.status_code == 400


def test_payroll_period_end_must_be_after_start():
    org = _make_org()
    teacher = _make_teacher(org, "+998900700005")
    client = APIClient()
    _make_admin_login(client, org, "+998900700006")

    response = client.post(
        "/api/v1/finance/payroll/",
        {
            "organization": str(org.id), "teacher_profile": str(teacher.id),
            "period_start": "2026-09-30", "period_end": "2026-09-01", "base_salary": "8000000.00",
        },
        format="json",
    )
    assert response.status_code == 400


def test_payroll_approve_mark_paid_transitions():
    org = _make_org()
    teacher = _make_teacher(org, "+998900700007")
    client = APIClient()
    _make_admin_login(client, org, "+998900700008")
    payroll = _make_payroll(org, teacher)

    response = client.post(f"/api/v1/finance/payroll/{payroll.id}/mark-paid/")
    assert response.status_code == 400

    response = client.post(f"/api/v1/finance/payroll/{payroll.id}/approve/")
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "approved"

    response = client.post(f"/api/v1/finance/payroll/{payroll.id}/mark-paid/", {"payment_method": "bank_transfer"}, format="json")
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["status"] == "paid"
    assert body["paid_at"] is not None


def test_payroll_cancel_not_allowed_once_paid():
    org = _make_org()
    teacher = _make_teacher(org, "+998900700009")
    client = APIClient()
    _make_admin_login(client, org, "+998900700010")
    payroll = _make_payroll(org, teacher)

    client.post(f"/api/v1/finance/payroll/{payroll.id}/approve/")
    client.post(f"/api/v1/finance/payroll/{payroll.id}/mark-paid/")

    response = client.post(f"/api/v1/finance/payroll/{payroll.id}/cancel/")
    assert response.status_code == 400


def test_payroll_is_isolated_per_organization():
    org_a = _make_org()
    org_b = _make_org()
    teacher_a = _make_teacher(org_a, "+998900700011")
    teacher_b = _make_teacher(org_b, "+998900700012")
    _make_payroll(org_a, teacher_a)
    _make_payroll(org_b, teacher_b)

    client = APIClient()
    _make_admin_login(client, org_a, "+998900700013")

    response = client.get("/api/v1/finance/payroll/")
    assert response.status_code == 200
    rows = response.json()["data"]["results"]
    assert len(rows) == 1
    assert rows[0]["teacher_profile"] == str(teacher_a.id)
