"""API-level tests for the Student portal's own-invoice access — real login
(not just ORM objects), same reasoning as
attendance/tests/test_attendance_authorization.py: HasModulePermission (and,
for checkout, the ownership check in payment_gateways.views.CheckoutInitiateView)
both read from request.user.

Fixture setup goes through the auth_bypass_rls alias throughout — see
finance/tests/test_finance.py's module docstring for why, under
`transaction=True`, this is what's needed.
"""

import uuid

import pytest
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from common.context import apply_org_context
from course.models import Course
from finance.models import Invoice
from finance.numbering import generate_invoice_number
from foundation.models import Organization, Role, User, UserRole
from groups.models import Group, GroupMember
from payment_gateways.models import PaymentGatewayAccount
from student.models import StudentProfile
from teacher.models import TeacherProfile

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _make_org():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-finance-auth-test-{uuid.uuid4().hex[:8]}", email="a@example.com"
        )


def _make_student_login(client, org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="S", last_name=phone[-4:], password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="student")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    profile = StudentProfile.objects.using(BYPASS_ALIAS).create(organization=org, user=user, student_code=f"STU-{phone[-9:]}")
    response = client.post("/api/v1/auth/login/", {"login_id": user.login_id, "password": "pw123456"}, format="json")
    assert response.status_code == 200
    return user, profile


def _make_admin_login(client, org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="A", last_name="Admin", password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="center_admin")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    response = client.post("/api/v1/auth/login/", {"login_id": user.login_id, "password": "pw123456"}, format="json")
    assert response.status_code == 200
    return user


def _make_invoice(org, student_profile, **kwargs):
    with db_transaction.atomic():
        apply_org_context(str(org.id))
        invoice_number = generate_invoice_number(Invoice, org)
    kwargs.setdefault("total_amount", "100000.00")
    kwargs.setdefault("due_date", "2026-09-30")
    invoice = Invoice.objects.using(BYPASS_ALIAS).create(
        organization=org, student_profile=student_profile, invoice_number=invoice_number, **kwargs
    )
    invoice.refresh_from_db(using=BYPASS_ALIAS)
    return invoice


def _make_group(org, price="150000.00"):
    course = Course.objects.using(BYPASS_ALIAS).create(
        organization=org, name="Course", code=f"CRS-{uuid.uuid4().hex[:8]}", category="General",
        price=price if price is not None else None,
    )
    teacher_user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="T", last_name="Teacher", password="pw123456", phone=f"+998907{uuid.uuid4().hex[:6]}",
    )
    teacher = TeacherProfile.objects.using(BYPASS_ALIAS).create(
        organization=org, user=teacher_user, teacher_code=f"TCH-{uuid.uuid4().hex[:6]}"
    )
    return Group.objects.using(BYPASS_ALIAS).create(
        organization=org, course=course, teacher=teacher, code=f"GRP-{uuid.uuid4().hex[:8]}", name="Group",
        start_date="2026-09-01", price=price,
    )


def _make_group_member(org, group, student_profile, status="active"):
    return GroupMember.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group, student_profile=student_profile, status=status
    )


def _make_gateway_account(org, provider="payme"):
    kwargs = {"merchant_id": "merchant-1", "secret_key": "s3cr3t"}
    if provider == "click":
        kwargs["service_id"] = "svc-1"
    return PaymentGatewayAccount.objects.using(BYPASS_ALIAS).create(organization=org, provider=provider, **kwargs)


def test_student_can_view_own_invoice():
    org = _make_org()
    client = APIClient()
    _user, profile = _make_student_login(client, org, "+998910000001")
    invoice = _make_invoice(org, profile)

    response = client.get("/api/v1/finance/invoices/")

    assert response.status_code == 200
    ids = [row["id"] for row in response.json()["data"]["results"]]
    assert ids == [str(invoice.id)]


def test_student_cannot_see_other_students_invoice():
    org = _make_org()
    client_a = APIClient()
    _user_a, profile_a = _make_student_login(client_a, org, "+998910000002")
    client_b = APIClient()
    _user_b, profile_b = _make_student_login(client_b, org, "+998910000003")
    invoice_b = _make_invoice(org, profile_b)

    response = client_a.get("/api/v1/finance/invoices/")
    assert response.status_code == 200
    ids = [row["id"] for row in response.json()["data"]["results"]]
    assert str(invoice_b.id) not in ids

    detail = client_a.get(f"/api/v1/finance/invoices/{invoice_b.id}/")
    assert detail.status_code == 404


def test_student_cannot_record_a_payment_directly():
    org = _make_org()
    client = APIClient()
    _user, profile = _make_student_login(client, org, "+998910000004")
    invoice = _make_invoice(org, profile)

    response = client.post(
        "/api/v1/finance/payments/",
        {"organization": str(org.id), "invoice": str(invoice.id), "amount": "50000.00", "payment_method": "cash"},
        format="json",
    )

    assert response.status_code == 403


def test_student_can_initiate_checkout_for_own_invoice():
    org = _make_org()
    _make_gateway_account(org, provider="payme")
    client = APIClient()
    _user, profile = _make_student_login(client, org, "+998910000005")
    invoice = _make_invoice(org, profile, total_amount="100000.00")

    response = client.post(
        "/api/v1/payment-gateways/checkout/", {"invoice": str(invoice.id), "provider": "payme"}, format="json"
    )

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["checkout_url"].startswith("https://checkout.paycom.uz/")


def test_student_cannot_initiate_checkout_for_another_students_invoice():
    org = _make_org()
    _make_gateway_account(org, provider="payme")
    client_a = APIClient()
    _user_a, profile_a = _make_student_login(client_a, org, "+998910000006")
    client_b = APIClient()
    _user_b, profile_b = _make_student_login(client_b, org, "+998910000007")
    invoice_b = _make_invoice(org, profile_b)

    response = client_a.post(
        "/api/v1/payment-gateways/checkout/", {"invoice": str(invoice_b.id), "provider": "payme"}, format="json"
    )

    assert response.status_code == 403


def test_center_admin_can_still_initiate_checkout_for_any_invoice():
    org = _make_org()
    _make_gateway_account(org, provider="click")
    client = APIClient()
    _make_admin_login(client, org, "+998910000008")
    student_client = APIClient()
    _user, profile = _make_student_login(student_client, org, "+998910000009")
    invoice = _make_invoice(org, profile)

    response = client.post(
        "/api/v1/payment-gateways/checkout/", {"invoice": str(invoice.id), "provider": "click"}, format="json"
    )

    assert response.status_code == 200


def test_student_can_self_create_invoice_for_own_group():
    org = _make_org()
    group = _make_group(org, price="150000.00")
    client = APIClient()
    _user, profile = _make_student_login(client, org, "+998910000011")
    _make_group_member(org, group, profile)

    response = client.post("/api/v1/finance/invoices/self-create/", {"group": str(group.id)}, format="json")

    assert response.status_code == 201
    body = response.json()["data"]
    assert body["total_amount"] == "150000.00"
    assert body["group"] == str(group.id)
    assert body["student_profile"] == str(profile.id)


def test_self_create_invoice_is_idempotent():
    org = _make_org()
    group = _make_group(org, price="150000.00")
    client = APIClient()
    _user, profile = _make_student_login(client, org, "+998910000012")
    _make_group_member(org, group, profile)

    first = client.post("/api/v1/finance/invoices/self-create/", {"group": str(group.id)}, format="json")
    second = client.post("/api/v1/finance/invoices/self-create/", {"group": str(group.id)}, format="json")

    assert first.json()["data"]["id"] == second.json()["data"]["id"]
    assert Invoice.objects.using(BYPASS_ALIAS).filter(group=group, student_profile=profile).count() == 1


def test_student_cannot_self_create_invoice_for_a_group_they_are_not_in():
    org = _make_org()
    group = _make_group(org, price="150000.00")
    client = APIClient()
    _make_student_login(client, org, "+998910000013")

    response = client.post("/api/v1/finance/invoices/self-create/", {"group": str(group.id)}, format="json")

    assert response.status_code == 403


def test_student_cannot_self_create_invoice_for_a_group_with_no_price():
    org = _make_org()
    group = _make_group(org, price=None)
    client = APIClient()
    _user, profile = _make_student_login(client, org, "+998910000014")
    _make_group_member(org, group, profile)

    response = client.post("/api/v1/finance/invoices/self-create/", {"group": str(group.id)}, format="json")

    assert response.status_code == 400


def test_student_cannot_self_create_invoice_for_a_zero_price_group():
    """A zero-total Invoice could never be resolved through either payment
    path (build_checkout_url refuses a <= 0 balance; Payment.amount has a
    > 0 DB constraint) — must be rejected the same as an unset price."""
    org = _make_org()
    group = _make_group(org, price="0.00")
    client = APIClient()
    _user, profile = _make_student_login(client, org, "+998910000015")
    _make_group_member(org, group, profile)

    response = client.post("/api/v1/finance/invoices/self-create/", {"group": str(group.id)}, format="json")

    assert response.status_code == 400


def test_student_sees_which_gateways_are_configured():
    org = _make_org()
    _make_gateway_account(org, provider="payme")
    client = APIClient()
    _make_student_login(client, org, "+998910000010")

    response = client.get(f"/api/v1/payment-gateways/gateway-accounts/?organization={org.id}")

    assert response.status_code == 200
    providers = [row["provider"] for row in response.json()["data"]["results"]]
    assert providers == ["payme"]
    assert "secret_key" not in response.json()["data"]["results"][0]
