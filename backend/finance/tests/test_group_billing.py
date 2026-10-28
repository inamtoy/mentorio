"""API-level tests for finance.views.GroupBillingViewSet — the Admin Finance
page's per-Group monthly payment roster. Real logins, same reasoning as
finance/tests/test_finance_authorization.py (whose fixture helpers these
reuse): the staff-only gate reads request.user.
"""

from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from finance.models import Invoice, Payment
from finance.services import billing_period_of
from finance.tests.test_finance_authorization import (
    BYPASS_ALIAS,
    _make_admin_login,
    _make_group,
    _make_group_member,
    _make_invoice,
    _make_org,
    _make_student_login,
)
from groups.models import GroupMember

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)


def _period():
    return billing_period_of(timezone.localdate())


def _backdate_member(member):
    """Members created "now" are in this month's roster already; backdating
    keeps the tests independent of what day of the month they run on."""
    GroupMember.objects.using(BYPASS_ALIAS).filter(pk=member.pk).update(
        created_at=timezone.now() - timedelta(days=40)
    )


def _setup(phone_suffix):
    org = _make_org()
    admin_client = APIClient()
    _make_admin_login(admin_client, org, f"+99890{phone_suffix}0")
    group = _make_group(org, price="300000.00")
    paid_student = _make_student_login(APIClient(), org, f"+99890{phone_suffix}1")[1]
    unpaid_student = _make_student_login(APIClient(), org, f"+99890{phone_suffix}2")[1]
    for student in (paid_student, unpaid_student):
        _backdate_member(_make_group_member(org, group, student))
    invoice = _make_invoice(
        org, paid_student, group=group, billing_period=_period(), total_amount="300000.00", status="paid",
        due_date=_period(),
    )
    Payment.objects.using(BYPASS_ALIAS).create(
        organization=org, invoice=invoice, student_profile=paid_student, amount="300000.00"
    )
    return org, admin_client, group, paid_student, unpaid_student


def test_list_counts_paid_and_unbilled_members():
    _org, client, group, _paid, _unpaid = _setup("100001")

    response = client.get("/api/v1/finance/group-billing/")

    assert response.status_code == 200
    [row] = response.json()["data"]["results"]
    assert row["id"] == str(group.id)
    assert (row["student_count"], row["paid_count"], row["unpaid_count"]) == (2, 1, 1)
    assert float(row["expected_amount"]) == 600000
    assert float(row["collected_amount"]) == 300000


def test_retrieve_lists_debtors_first():
    _org, client, group, paid, unpaid = _setup("100002")

    response = client.get(f"/api/v1/finance/group-billing/{group.id}/")

    assert response.status_code == 200
    members = response.json()["data"]["members"]
    assert [m["student_profile"] for m in members] == [str(unpaid.id), str(paid.id)]
    assert members[0]["invoice_count"] == 0
    assert members[0]["status"] == "unpaid"


def test_hand_made_invoice_due_this_month_is_the_students_bill():
    org, client, group, _paid, unpaid = _setup("100009")
    # A one-off invoice an admin raised against the Group: no billing_period,
    # a different amount than the Group's monthly price.
    _make_invoice(org, unpaid, group=group, total_amount="250000.00", due_date=_period())

    response = client.get(f"/api/v1/finance/group-billing/{group.id}/")

    row = next(m for m in response.json()["data"]["members"] if m["student_profile"] == str(unpaid.id))
    assert row["invoice_count"] == 1
    assert float(row["total_amount"]) == 250000
    assert float(response.json()["data"]["expected_amount"]) == 550000


def test_pay_spreads_across_the_months_invoices_earliest_due_first():
    org, client, group, _paid, unpaid = _setup("100010")
    period = _period()
    first = _make_invoice(org, unpaid, group=group, total_amount="100000.00", due_date=period)
    second = _make_invoice(
        org, unpaid, group=group, total_amount="300000.00", due_date=period, billing_period=period
    )
    Invoice.objects.using(BYPASS_ALIAS).filter(pk=second.pk).update(due_date=period + timedelta(days=1))

    response = client.post(
        f"/api/v1/finance/group-billing/{group.id}/pay/",
        {"student_profile": str(unpaid.id), "period": period.strftime("%Y-%m"), "amount": "150000"},
        format="json",
    )

    assert response.status_code == 201
    first.refresh_from_db(using=BYPASS_ALIAS)
    second.refresh_from_db(using=BYPASS_ALIAS)
    assert first.status == "paid"
    assert second.status == "partially_paid"
    # No extra monthly invoice raised next to the existing ones.
    assert Invoice.objects.using(BYPASS_ALIAS).filter(student_profile=unpaid, group=group).count() == 2


def test_pay_raises_missing_invoice_and_records_partial_payment():
    _org, client, group, _paid, unpaid = _setup("100003")

    response = client.post(
        f"/api/v1/finance/group-billing/{group.id}/pay/",
        {"student_profile": str(unpaid.id), "period": _period().strftime("%Y-%m"), "amount": "100000"},
        format="json",
    )

    assert response.status_code == 201
    invoice = Invoice.objects.using(BYPASS_ALIAS).get(student_profile=unpaid, group=group, billing_period=_period())
    assert invoice.status == "partially_paid"
    assert Payment.objects.using(BYPASS_ALIAS).filter(invoice=invoice).count() == 1
    row = next(m for m in response.json()["data"]["members"] if m["student_profile"] == str(unpaid.id))
    assert float(row["balance"]) == 200000


def test_pay_refuses_more_than_the_balance_and_leaves_nothing_behind():
    _org, client, group, _paid, unpaid = _setup("100004")

    response = client.post(
        f"/api/v1/finance/group-billing/{group.id}/pay/",
        {"student_profile": str(unpaid.id), "period": _period().strftime("%Y-%m"), "amount": "300000.01"},
        format="json",
    )

    assert response.status_code == 400
    # The invoice raised for the payment rolls back with it.
    assert not Invoice.objects.using(BYPASS_ALIAS).filter(student_profile=unpaid, group=group).exists()


def test_pay_refuses_a_student_outside_the_group():
    org, client, group, _paid, _unpaid = _setup("100005")
    outsider = _make_student_login(APIClient(), org, "+998901000059")[1]

    response = client.post(
        f"/api/v1/finance/group-billing/{group.id}/pay/",
        {"student_profile": str(outsider.id), "period": _period().strftime("%Y-%m"), "amount": "1000"},
        format="json",
    )

    assert response.status_code == 400


def test_monthly_run_does_not_bill_a_month_already_billed_by_hand():
    org, _client, group, _paid, unpaid = _setup("100011")
    _make_invoice(org, unpaid, group=group, total_amount="250000.00", due_date=_period())

    call_command(
        "issue_monthly_invoices", period=_period().strftime("%Y-%m"), organization=str(org.id), stdout=StringIO()
    )

    assert Invoice.objects.using(BYPASS_ALIAS).filter(student_profile=unpaid, group=group).count() == 1


def test_hand_made_invoice_is_refused_when_the_month_is_already_billed():
    org, client, group, paid, _unpaid = _setup("100012")

    response = client.post(
        "/api/v1/finance/invoices/",
        {
            "organization": str(org.id), "student_profile": str(paid.id), "group": str(group.id),
            "total_amount": "300000", "due_date": (_period() + timedelta(days=9)).isoformat(),
        },
        format="json",
    )

    assert response.status_code == 400
    assert "already has invoice" in response.json()["message"]
    assert Invoice.objects.using(BYPASS_ALIAS).filter(student_profile=paid, group=group).count() == 1


def test_future_period_is_refused():
    _org, client, _group, _paid, _unpaid = _setup("100006")
    future = (_period() + timedelta(days=40)).strftime("%Y-%m")

    response = client.get(f"/api/v1/finance/group-billing/?period={future}")

    assert response.status_code == 400


def test_student_cannot_see_group_billing():
    org = _make_org()
    client = APIClient()
    _make_student_login(client, org, "+998901000071")

    response = client.get("/api/v1/finance/group-billing/")

    assert response.status_code == 403


def test_other_organization_groups_are_invisible():
    _org, _client, group, _paid, _unpaid = _setup("100008")
    other_org = _make_org()
    other_client = APIClient()
    _make_admin_login(other_client, other_org, "+998901000089")

    listing = other_client.get("/api/v1/finance/group-billing/")
    detail = other_client.get(f"/api/v1/finance/group-billing/{group.id}/")

    assert listing.json()["data"]["results"] == []
    assert detail.status_code == 404
