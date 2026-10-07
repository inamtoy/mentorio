"""API-level tests for finance.ExpenseViewSet: CRUD, status transitions, and
org isolation. Real login (not just ORM objects) — HasModulePermission reads
from request.user. Fixture setup goes through the auth_bypass_rls alias,
same reasoning as finance/tests/test_finance.py's module docstring.
"""

import uuid

import pytest
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from common.context import apply_org_context
from finance.models import Expense
from foundation.models import Organization, Role, User, UserRole

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _make_org():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-expense-test-{uuid.uuid4().hex[:8]}", email="a@example.com"
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


def _make_teacher_login(client, org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="T", last_name="Teacher", password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="teacher")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    response = client.post("/api/v1/auth/login/", {"login_id": user.login_id, "password": "pw123456"}, format="json")
    assert response.status_code == 200
    return user


def _make_expense(org, **kwargs):
    kwargs.setdefault("category", "supplies")
    kwargs.setdefault("title", "Office supplies")
    kwargs.setdefault("amount", "150000.00")
    expense = Expense.objects.using(BYPASS_ALIAS).create(organization=org, **kwargs)
    expense.refresh_from_db(using=BYPASS_ALIAS)
    return expense


def test_center_admin_can_create_and_list_expenses():
    org = _make_org()
    client = APIClient()
    _make_admin_login(client, org, "+998900600001")

    response = client.post(
        "/api/v1/finance/expenses/",
        {"organization": str(org.id), "category": "rent", "title": "Office rent", "amount": "5000000.00"},
        format="json",
    )
    assert response.status_code == 201
    body = response.json()["data"]
    assert body["status"] == "pending"
    assert body["title"] == "Office rent"

    response = client.get("/api/v1/finance/expenses/")
    assert response.status_code == 200
    assert len(response.json()["data"]["results"]) == 1


def test_teacher_cannot_access_expenses():
    org = _make_org()
    client = APIClient()
    _make_teacher_login(client, org, "+998900600002")

    response = client.get("/api/v1/finance/expenses/")
    assert response.status_code == 403


def test_expense_approve_reject_mark_paid_transitions():
    org = _make_org()
    client = APIClient()
    _make_admin_login(client, org, "+998900600003")
    expense = _make_expense(org)

    # Can't mark-paid or reject a pending expense that hasn't been approved.
    response = client.post(f"/api/v1/finance/expenses/{expense.id}/mark-paid/")
    assert response.status_code == 400

    response = client.post(f"/api/v1/finance/expenses/{expense.id}/approve/")
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "approved"
    assert response.json()["data"]["approved_by"] is not None

    # Can't re-approve an already-approved expense.
    response = client.post(f"/api/v1/finance/expenses/{expense.id}/approve/")
    assert response.status_code == 400

    response = client.post(f"/api/v1/finance/expenses/{expense.id}/mark-paid/", {"payment_method": "cash"}, format="json")
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["status"] == "paid"
    assert body["paid_at"] is not None
    assert body["payment_method"] == "cash"


def test_expense_reject_from_pending():
    org = _make_org()
    client = APIClient()
    _make_admin_login(client, org, "+998900600004")
    expense = _make_expense(org)

    response = client.post(f"/api/v1/finance/expenses/{expense.id}/reject/")
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "rejected"

    # A rejected expense can't then be approved.
    response = client.post(f"/api/v1/finance/expenses/{expense.id}/approve/")
    assert response.status_code == 400


def test_expense_delete_soft_deletes():
    org = _make_org()
    client = APIClient()
    _make_admin_login(client, org, "+998900600005")
    expense = _make_expense(org)

    response = client.delete(f"/api/v1/finance/expenses/{expense.id}/")
    assert response.status_code == 200
    assert not Expense.objects.using(BYPASS_ALIAS).filter(pk=expense.id).exists()
    assert Expense.all_objects.using(BYPASS_ALIAS).filter(pk=expense.id).exists()


def test_expenses_are_isolated_per_organization():
    org_a = _make_org()
    org_b = _make_org()
    _make_expense(org_a, title="Org A expense")
    _make_expense(org_b, title="Org B expense")

    client = APIClient()
    _make_admin_login(client, org_a, "+998900600006")

    response = client.get("/api/v1/finance/expenses/")
    assert response.status_code == 200
    rows = response.json()["data"]["results"]
    assert len(rows) == 1
    assert rows[0]["title"] == "Org A expense"
