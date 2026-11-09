"""Deletes login attempts older than the retention period. Run once a day (cron):

    python manage.py cleanup_login_attempts
    python manage.py cleanup_login_attempts --dry-run      # only report
    python manage.py cleanup_login_attempts --days 60

Every login POST writes a row, including every request in a bot's brute-force
run, so without this the table only grows. Old rows serve no purpose: the
lockout (LoginView._enforce_lockout) only reads the last 30 minutes, and
successful sign-ins are also recorded in foundation.audit_logs (action
"login"), which is not touched here. These rows are hard-deleted rather than
soft-deleted: the point is to stop keeping attackers' input (login_ids,
user agents) and visitors' IP addresses longer than needed.

Runs through the BYPASSRLS connection: the table has row-level security, and
attempts for unknown login_ids carry no organization, so a tenant-scoped
connection would never see them.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from auth_custom.models import LoginAttempt
from auth_custom.services.session_service import BYPASS_ALIAS

DEFAULT_RETENTION_DAYS = 30
# Deleted in batches so one run never holds a long lock on the table that
# every login writes to.
BATCH_SIZE = 5000


class Command(BaseCommand):
    help = "Delete login attempts older than the retention period (default 30 days)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=DEFAULT_RETENTION_DAYS,
            help=f"Keep attempts from the last N days (default: {DEFAULT_RETENTION_DAYS}).",
        )
        parser.add_argument("--dry-run", action="store_true", help="Report what would be deleted, change nothing.")

    def handle(self, *args, **options):
        days = options["days"]
        if days < 1:
            # The lockout reads the last 30 minutes; never delete what it still needs.
            raise CommandError("--days must be at least 1.")
        cutoff = timezone.now() - timedelta(days=days)
        stale = LoginAttempt.objects.using(BYPASS_ALIAS).filter(created_at__lt=cutoff)

        if options["dry_run"]:
            self.stdout.write(f"Would delete {stale.count()} login attempts older than {days} days.")
            return

        deleted = 0
        while True:
            batch = list(stale.values_list("id", flat=True)[:BATCH_SIZE])
            if not batch:
                break
            count, _ = LoginAttempt.objects.using(BYPASS_ALIAS).filter(id__in=batch).delete()
            deleted += count
        self.stdout.write(f"Deleted {deleted} login attempts older than {days} days.")
