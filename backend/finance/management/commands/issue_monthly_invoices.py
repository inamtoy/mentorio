"""Raises each Group's monthly invoices. Run once a day (cron):

    python manage.py issue_monthly_invoices
    python manage.py issue_monthly_invoices --period 2026-11   # a specific month

Bills the current month for every active member of every active Group,
due on the Group's billing day. Daily rather than only on the 1st, so a day
the job didn't run is caught up the next; the one-live-invoice-per-student-
Group-month rule (finance.services.get_or_create_group_invoice) keeps it to
one invoice however often it runs.

Students who joined during the month are skipped for that month: enrolling
already billed their first month (or the admin chose not to), see
groups.views.GroupMemberViewSet.perform_create.
"""

from datetime import date, datetime, time

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from auth_custom.services.session_service import BYPASS_ALIAS
from finance.services import billing_due_date, billing_period_of, get_or_create_group_invoice
from groups.models import GroupMember


def _month_end(period: date) -> date:
    next_month = date(period.year + period.month // 12, period.month % 12 + 1, 1)
    return date.fromordinal(next_month.toordinal() - 1)


class Command(BaseCommand):
    help = "Issue this month's invoices for every active Group member."

    def add_arguments(self, parser):
        parser.add_argument("--period", help="Month to bill, YYYY-MM (default: the current month).")

    def handle(self, *args, **options):
        if options["period"]:
            try:
                period = datetime.strptime(options["period"], "%Y-%m").date()
            except ValueError as exc:
                raise CommandError("--period must look like 2026-11.") from exc
        else:
            period = billing_period_of(timezone.localdate())
        period_start = timezone.make_aware(datetime.combine(period, time.min))

        members = (
            GroupMember.objects.using(BYPASS_ALIAS)
            .filter(
                status="active",
                created_at__lt=period_start,
                group__deleted_at__isnull=True,
                group__status="active",
                group__start_date__lte=_month_end(period),
                student_profile__deleted_at__isnull=True,
            )
            .exclude(group__end_date__lt=period)
            .select_related("group__course", "student_profile__user")
            .order_by("group_id", "created_at")
        )

        issued = skipped_no_price = 0
        for member in members.iterator(chunk_size=500):
            group = member.group
            # One transaction per invoice: one bad row doesn't roll back the
            # rest, and each invoice commits together with its notification.
            with transaction.atomic(using=BYPASS_ALIAS):
                result = get_or_create_group_invoice(
                    group, member.student_profile, period=period, due_date=billing_due_date(group, period),
                    using=BYPASS_ALIAS,
                )
            if result is None:
                skipped_no_price += 1
            elif result[1]:
                issued += 1

        self.stdout.write(
            f"{period:%Y-%m}: issued {issued} invoices; {skipped_no_price} members in groups with no price."
        )
