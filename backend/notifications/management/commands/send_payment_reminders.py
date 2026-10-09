"""Queues "payment due soon" notifications. Run once a day (cron):

    python manage.py send_payment_reminders

Picks every unpaid invoice due within REMINDER_DAYS (today included). The
window rather than an exact "due in 3 days" match means a day the job
didn't run is caught up the next day; the per-invoice event key keeps it
to one reminder per invoice however often this runs.
"""

from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from auth_custom.services.session_service import BYPASS_ALIAS
from finance.models import Invoice
from notifications.services import events

REMINDER_DAYS = 3


class Command(BaseCommand):
    help = f"Notify students and parents about invoices due within {REMINDER_DAYS} days."

    def handle(self, *args, **options):
        today = timezone.localdate()
        invoices = (
            Invoice.objects.using(BYPASS_ALIAS)
            .filter(
                status__in=["pending", "partially_paid"],
                due_date__gte=today,
                due_date__lte=today + timedelta(days=REMINDER_DAYS),
                student_profile__deleted_at__isnull=True,
            )
            .select_related("student_profile__user", "group")
            # One query for every balance, not one aggregate per invoice —
            # same sum as finance.services.invoice_paid_amount (soft-deleted
            # payments don't count).
            .annotate(
                paid=Coalesce(
                    Sum("payments__amount", filter=Q(payments__deleted_at__isnull=True)),
                    Value(Decimal("0")),
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                )
            )
            .order_by("due_date")
        )

        queued = 0
        for invoice in invoices.iterator(chunk_size=500):
            balance = invoice.total_amount - invoice.paid
            if balance <= 0:
                continue
            if events.invoice_due_soon(invoice, balance=balance, using=BYPASS_ALIAS) is not None:
                queued += 1

        self.stdout.write(f"Queued reminders for {queued} invoices.")
