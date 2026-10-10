from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from finance.models import Invoice, Payroll
from finance.numbering import generate_invoice_number
from notifications.services import events as notification_events

GROUP_INVOICE_DUE_DAYS = 7


def invoice_paid_amount(invoice: Invoice) -> Decimal:
    return invoice.payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")


def invoice_balance(invoice: Invoice) -> Decimal:
    return invoice.total_amount - invoice_paid_amount(invoice)


def recompute_invoice_status(invoice: Invoice) -> None:
    """Mirrors the DDL's payment trigger, in Python — same call already made
    for GroupMember's capacity check and Attendance's ownership check living
    in application code rather than a SQL trigger. Shared by
    finance.views.PaymentViewSet (a payment recorded/deleted by an admin)
    and payment_gateways' webhook handlers (a payment settled/reversed by
    Payme or Click) — both mutate finance.Payment rows and must keep the
    parent Invoice's status in sync the same way.
    """

    paid = invoice_paid_amount(invoice)
    status = "paid" if paid >= invoice.total_amount else "partially_paid" if paid > 0 else "pending"
    if status != invoice.status:
        invoice.status = status
        invoice.save(update_fields=["status"])


def payroll_net_amount(payroll: Payroll) -> Decimal:
    return payroll.base_salary + payroll.bonus - payroll.deductions - payroll.tax_amount


def group_monthly_price(group) -> Decimal | None:
    """What one student pays per month for this Group. The Group's own price
    wins over its Course's — centers open a new Group for each level, often
    at a higher price, so the Course price is only a default. A Group price
    of 0 counts as unset: the Admin group form has no "blank" state for its
    numeric price field and saves 0 when it's left untouched.

    None when neither is set (or both are 0): a zero-total Invoice could
    never be paid off through the gateway flow (build_checkout_url refuses a
    <= 0 balance) or via a direct Payment (amount > 0 DB constraint), so it
    would sit at status="pending" forever.
    """
    return group.price or group.course.price or None


def get_or_create_group_invoice(group, student_profile, *, created_by=None) -> tuple[Invoice, bool] | None:
    """The one place an Invoice is raised for a student's Group membership —
    shared by an admin enrolling the student (groups.views.GroupMemberViewSet)
    and the student generating it themselves (InvoiceViewSet.self_create).

    Returns (invoice, created), or None when the Group has no billable price.
    Idempotent: any non-cancelled invoice already raised for this student and
    Group is returned instead of a duplicate. Call inside the request's
    transaction — the invoice_issued notification commits with it.
    """
    price = group_monthly_price(group)
    if price is None:
        return None

    existing = Invoice.objects.filter(student_profile=student_profile, group=group).exclude(status="cancelled").first()
    if existing is not None:
        return existing, False

    invoice = Invoice.objects.create(
        organization=group.organization,
        student_profile=student_profile,
        group=group,
        invoice_number=generate_invoice_number(Invoice, group.organization),
        total_amount=price,
        currency=group.currency,
        due_date=timezone.now().date() + timedelta(days=GROUP_INVOICE_DUE_DAYS),
        created_by=created_by,
    )
    notification_events.invoice_issued(invoice)
    return invoice, True
