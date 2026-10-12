from decimal import Decimal

from django.db.models import DecimalField, ExpressionWrapper, F, Sum

from finance.models import Invoice, Payroll


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
