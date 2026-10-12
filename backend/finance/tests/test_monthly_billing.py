"""Monthly Group billing: due-date rules (finance.services) and the
issue_monthly_invoices command. Fixtures as in test_finance_authorization.py.
"""

import io
import uuid
from datetime import date, datetime, timedelta
from types import SimpleNamespace

import pytest
from django.core.management import call_command
from django.utils import timezone

from finance.models import Invoice
from finance.services import first_month_due_date
from finance.tests.test_finance_authorization import (
    BYPASS_ALIAS,
    _make_group,
    _make_group_member,
    _make_org,
    _make_student_login,
)
from groups.models import GroupMember
from notifications.models import Notification

db = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)


def _next_period() -> date:
    today = timezone.localdate()
    return (today.replace(day=1) + timedelta(days=32)).replace(day=1)


def _run(period: date, org) -> str:
    """Scoped to the test's own organization: the transactional test flush
    doesn't truncate tables outside the public schema, so other tests' groups
    and members are still in the database and would change the counts."""
    out = io.StringIO()
    call_command("issue_monthly_invoices", period=f"{period:%Y-%m}", organization=str(org.id), stdout=out)
    return out.getvalue()


def _student(org, n):
    from rest_framework.test import APIClient

    _user, profile = _make_student_login(APIClient(), org, f"+99893{uuid.uuid4().int % 10**7:07d}")
    return profile


@pytest.mark.parametrize(
    ("today", "expected"),
    [
        (date(2026, 10, 3), date(2026, 10, 5)),  # billing day still ahead: pay with everyone else
        (date(2026, 10, 5), date(2026, 10, 5)),  # on the day itself
        (date(2026, 10, 20), date(2026, 10, 27)),  # already passed: 7-day grace
    ],
)
def test_first_month_due_date(today, expected):
    assert first_month_due_date(SimpleNamespace(billing_day=5), today) == expected


@db
def test_bills_every_active_member_due_on_the_billing_day():
    org = _make_org()
    group = _make_group(org, price="400000.00")
    group.status = "active"
    group.billing_day = 5
    group.save(using=BYPASS_ALIAS, update_fields=["status", "billing_day"])
    a, b = _student(org, 1), _student(org, 2)
    _make_group_member(org, group, a)
    _make_group_member(org, group, b)
    period = _next_period()

    output = _run(period, org)

    invoices = Invoice.objects.using(BYPASS_ALIAS).filter(group=group, billing_period=period)
    assert invoices.count() == 2
    assert {i.due_date for i in invoices} == {period.replace(day=5)}
    assert {str(i.total_amount) for i in invoices} == {"400000.00"}
    assert len({i.invoice_number for i in invoices}) == 2
    issued_keys = {f"invoice_issued:{i.id}" for i in invoices}
    assert Notification.objects.using(BYPASS_ALIAS).filter(event_key__in=issued_keys).count() == 2
    assert "issued 2 invoices" in output


@db
def test_rerunning_the_same_month_does_not_double_bill():
    org = _make_org()
    group = _make_group(org, price="400000.00")
    group.status = "active"
    group.save(using=BYPASS_ALIAS, update_fields=["status"])
    _make_group_member(org, group, _student(org, 3))
    period = _next_period()

    _run(period, org)
    second = _run(period, org)

    assert Invoice.objects.using(BYPASS_ALIAS).filter(group=group, billing_period=period).count() == 1
    assert "issued 0 invoices" in second


@db
def test_cancelled_invoice_can_be_reissued():
    org = _make_org()
    group = _make_group(org, price="400000.00")
    group.status = "active"
    group.save(using=BYPASS_ALIAS, update_fields=["status"])
    _make_group_member(org, group, _student(org, 4))
    period = _next_period()
    _run(period, org)
    Invoice.objects.using(BYPASS_ALIAS).filter(group=group).update(status="cancelled")

    _run(period, org)

    assert Invoice.objects.using(BYPASS_ALIAS).filter(group=group, billing_period=period).count() == 2


@db
def test_skips_who_should_not_be_billed():
    org = _make_org()
    period = _next_period()

    forming = _make_group(org, price="400000.00")  # status "forming": hasn't started
    _make_group_member(org, forming, _student(org, 5))

    no_price = _make_group(org, price=None)
    no_price.status = "active"
    no_price.save(using=BYPASS_ALIAS, update_fields=["status"])
    _make_group_member(org, no_price, _student(org, 6))

    active = _make_group(org, price="400000.00")
    active.status = "active"
    active.save(using=BYPASS_ALIAS, update_fields=["status"])
    _make_group_member(org, active, _student(org, 7), status="dropped")
    joined_mid_month = _make_group_member(org, active, _student(org, 8))
    # Joined during the billed month: enrollment already billed that month.
    GroupMember.objects.using(BYPASS_ALIAS).filter(pk=joined_mid_month.pk).update(
        created_at=timezone.make_aware(datetime(period.year, period.month, 10))
    )

    output = _run(period, org)

    assert not Invoice.objects.using(BYPASS_ALIAS).filter(organization=org).exists()
    assert "1 members in groups with no price" in output


@db
def test_rejects_a_malformed_period():
    from django.core.management.base import CommandError

    with pytest.raises(CommandError):
        call_command("issue_monthly_invoices", period="November")


def test_rejects_a_malformed_organization():
    from django.core.management.base import CommandError

    with pytest.raises(CommandError):
        call_command("issue_monthly_invoices", organization="not-a-uuid")


@db
def test_organization_option_bills_only_that_organization():
    org, other_org = _make_org(), _make_org()
    period = _next_period()
    groups = []
    for o, n in ((org, 9), (other_org, 10)):
        group = _make_group(o, price="400000.00")
        group.status = "active"
        group.save(using=BYPASS_ALIAS, update_fields=["status"])
        _make_group_member(o, group, _student(o, n))
        groups.append(group)

    output = _run(period, org)

    assert Invoice.objects.using(BYPASS_ALIAS).filter(group=groups[0], billing_period=period).count() == 1
    assert not Invoice.objects.using(BYPASS_ALIAS).filter(group=groups[1]).exists()
    assert "issued 1 invoices" in output
