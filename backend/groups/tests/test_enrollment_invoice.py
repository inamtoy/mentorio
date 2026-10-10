"""Enrolling a student in a Group bills their first month at the Group's
monthly price (groups.views.GroupMemberViewSet.perform_create). Real login,
same fixture style as finance/tests/test_finance_authorization.py.
"""

import uuid

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from finance.models import Invoice
from finance.services import billing_period_of
from finance.tests.test_finance_authorization import (
    BYPASS_ALIAS,
    _make_admin_login,
    _make_group,
    _make_invoice,
    _make_org,
    _make_student_login,
)
from groups.models import GroupMember
from notifications.models import Notification

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)


def _enroll(client, org, group, profile, **extra):
    return client.post(
        "/api/v1/groups/members/",
        {"organization": str(org.id), "group": str(group.id), "student_profile": str(profile.id), **extra},
        format="json",
    )


def _phone():
    return f"+99893{uuid.uuid4().int % 10**7:07d}"


def test_enrolling_a_student_issues_an_invoice_at_the_group_price():
    org = _make_org()
    group = _make_group(org, price="500000.00")
    admin = APIClient()
    _make_admin_login(admin, org, _phone())
    _user, profile = _make_student_login(APIClient(), org, _phone())

    response = _enroll(admin, org, group, profile)

    assert response.status_code == 201
    invoice_data = response.json()["data"]["invoice"]
    assert invoice_data["total_amount"] == "500000.00"
    assert invoice_data["group"] == str(group.id)
    invoice = Invoice.objects.using(BYPASS_ALIAS).get(student_profile=profile, group=group)
    assert invoice.status == "pending"
    assert Notification.objects.using(BYPASS_ALIAS).filter(event_key=f"invoice_issued:{invoice.id}").exists()


def test_group_without_its_own_price_falls_back_to_the_course_price():
    org = _make_org()
    group = _make_group(org, price="300000.00")
    group.price = None
    group.save(using=BYPASS_ALIAS, update_fields=["price"])
    admin = APIClient()
    _make_admin_login(admin, org, _phone())
    _user, profile = _make_student_login(APIClient(), org, _phone())

    response = _enroll(admin, org, group, profile)

    assert response.status_code == 201
    assert response.json()["data"]["invoice"]["total_amount"] == "300000.00"


def test_group_with_no_price_still_enrolls_without_an_invoice():
    org = _make_org()
    group = _make_group(org, price=None)
    admin = APIClient()
    _make_admin_login(admin, org, _phone())
    _user, profile = _make_student_login(APIClient(), org, _phone())

    response = _enroll(admin, org, group, profile)

    assert response.status_code == 201
    assert response.json()["data"]["invoice"] is None
    assert GroupMember.objects.using(BYPASS_ALIAS).filter(group=group, student_profile=profile).exists()
    assert not Invoice.objects.using(BYPASS_ALIAS).filter(student_profile=profile).exists()


def test_create_invoice_false_skips_the_invoice():
    org = _make_org()
    group = _make_group(org, price="500000.00")
    admin = APIClient()
    _make_admin_login(admin, org, _phone())
    _user, profile = _make_student_login(APIClient(), org, _phone())

    response = _enroll(admin, org, group, profile, create_invoice=False)

    assert response.status_code == 201
    assert response.json()["data"]["invoice"] is None
    assert not Invoice.objects.using(BYPASS_ALIAS).filter(student_profile=profile).exists()


def test_existing_invoice_for_the_group_is_not_duplicated():
    org = _make_org()
    group = _make_group(org, price="500000.00")
    admin = APIClient()
    _make_admin_login(admin, org, _phone())
    _user, profile = _make_student_login(APIClient(), org, _phone())
    _make_invoice(org, profile, group=group, total_amount="500000.00", billing_period=billing_period_of(timezone.localdate()))

    response = _enroll(admin, org, group, profile)

    assert response.status_code == 201
    assert response.json()["data"]["invoice"] is None
    assert Invoice.objects.using(BYPASS_ALIAS).filter(student_profile=profile, group=group).count() == 1


def test_group_exposes_its_effective_monthly_price():
    org = _make_org()
    group = _make_group(org, price="300000.00")
    group.price = None
    group.save(using=BYPASS_ALIAS, update_fields=["price"])
    admin = APIClient()
    _make_admin_login(admin, org, _phone())

    response = admin.get(f"/api/v1/groups/{group.id}/")

    assert response.status_code == 200
    assert response.json()["data"]["price"] is None
    assert response.json()["data"]["effective_price"] == "300000.00"


def test_enrollment_invoice_covers_this_month():
    org = _make_org()
    group = _make_group(org, price="500000.00")
    admin = APIClient()
    _make_admin_login(admin, org, _phone())
    _user, profile = _make_student_login(APIClient(), org, _phone())

    response = _enroll(admin, org, group, profile)

    assert response.json()["data"]["invoice"]["billing_period"] == billing_period_of(timezone.localdate()).isoformat()


def test_billing_day_must_exist_in_every_month():
    org = _make_org()
    group = _make_group(org)
    admin = APIClient()
    _make_admin_login(admin, org, _phone())

    too_late = admin.patch(f"/api/v1/groups/{group.id}/", {"billing_day": 29}, format="json")
    ok = admin.patch(f"/api/v1/groups/{group.id}/", {"billing_day": 5}, format="json")

    assert too_late.status_code == 400
    assert ok.status_code == 200
    assert ok.json()["data"]["billing_day"] == 5
