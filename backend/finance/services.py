from datetime import date, timedelta
from decimal import Decimal

from django.db import DEFAULT_DB_ALIAS, IntegrityError, transaction
from django.db.models import DecimalField, ExpressionWrapper, F, Sum
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


def payroll_net_amount_expression() -> ExpressionWrapper:
    """The same net-amount formula as `payroll_net_amount` above, as a DB
    expression — for aggregating many Payroll rows in SQL (e.g.
    reports.views.FinanceSummaryReportView) instead of a Python loop. Kept
    right next to its per-instance twin so the two can't drift apart;
    finance/tests/test_payroll.py asserts they agree.
    """
    return ExpressionWrapper(
        F("base_salary") + F("bonus") - F("deductions") - F("tax_amount"),
        output_field=DecimalField(max_digits=12, decimal_places=2),
    )


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


def billing_period_of(day) -> date:
    """The billing period (first of the month) a calendar day falls in."""
    return day.replace(day=1)


def billing_due_date(group, period: date) -> date:
    """When `period`'s monthly fee is due: the Group's billing day that month."""
    return period.replace(day=group.billing_day)


def first_month_due_date(group, today: date) -> date:
    """Due date for the month a student joins in. This month's billing day
    if it's still ahead — joined on the 3rd, pays by the 5th like everyone
    else — otherwise a GROUP_INVOICE_DUE_DAYS grace period, so a student
    joining on the 20th isn't instantly overdue.
    """
    due = billing_due_date(group, billing_period_of(today))
    return due if due >= today else today + timedelta(days=GROUP_INVOICE_DUE_DAYS)


def get_or_create_group_invoice(
    group, student_profile, *, period: date | None = None, due_date: date | None = None, created_by=None,
    using: str = DEFAULT_DB_ALIAS,
) -> tuple[Invoice, bool] | None:
    """The one place a Group's monthly fee is invoiced — shared by an admin
    enrolling a student (groups.views.GroupMemberViewSet), the student
    generating it themselves (InvoiceViewSet.self_create), and the monthly
    run (finance/management/commands/issue_monthly_invoices.py).

    `period` defaults to the current month and `due_date` to
    first_month_due_date — the enrollment case. Returns (invoice, created),
    or None when the Group has no billable price. Idempotent per student,
    Group and month: the live invoice already raised for that month is
    returned instead of a duplicate (uq_invoices_student_group_period backs
    this up against a concurrent run). Call inside a transaction — the
    invoice_issued notification commits with the invoice.
    """
    price = group_monthly_price(group)
    if price is None:
        return None

    today = timezone.localdate()
    period = period or billing_period_of(today)
    live = Invoice.objects.using(using).filter(student_profile=student_profile, group=group, billing_period=period)
    existing = live.exclude(status="cancelled").first()
    if existing is not None:
        return existing, False

    try:
        with transaction.atomic(using=using):
            invoice = Invoice.objects.using(using).create(
                organization_id=group.organization_id,
                student_profile=student_profile,
                group=group,
                invoice_number=generate_invoice_number(Invoice, group.organization_id, using=using),
                total_amount=price,
                currency=group.currency,
                billing_period=period,
                due_date=due_date or first_month_due_date(group, today),
                created_by=created_by,
            )
    except IntegrityError:
        # Lost a race with a concurrent request/run for the same month —
        # anything else (e.g. an invoice-number clash) is a real error.
        existing = live.exclude(status="cancelled").first()
        if existing is None:
            raise
        return existing, False
    notification_events.invoice_issued(invoice, using=using)
    return invoice, True
