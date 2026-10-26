"""Removes uploads that were never attached to anything. Run once a day (cron):

    python manage.py cleanup_unlinked_uploads
    python manage.py cleanup_unlinked_uploads --dry-run          # only report
    python manage.py cleanup_unlinked_uploads --older-than-hours 48

Attaching is two steps (see homework/attachments.py): the client uploads a
file, which stays unlinked, then sends its id with the assignment or
submission. A form that is closed instead of saved leaves the upload behind
for good. Once such a file is older than the cutoff, its File row is
soft-deleted (kept, like every other row) and its bytes are removed from
disk — nothing can reference them, so keeping them only uses space.

Files removed *from* a saved record are linked (entity_id set) and are not
touched here: set_attachments() keeps their bytes so the removal can be
undone. Leftover `.part` files from writes that crashed midway are removed
too.
"""

from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from auth_custom.services.session_service import BYPASS_ALIAS
from foundation.file_storage import stored_file_path
from foundation.models import File

DEFAULT_OLDER_THAN_HOURS = 24


class Command(BaseCommand):
    help = "Soft-delete uploads never attached to a record and free their disk space."

    def add_arguments(self, parser):
        parser.add_argument(
            "--older-than-hours",
            type=int,
            default=DEFAULT_OLDER_THAN_HOURS,
            help=f"Only uploads at least this old (default: {DEFAULT_OLDER_THAN_HOURS}).",
        )
        parser.add_argument("--dry-run", action="store_true", help="Report what would be removed, change nothing.")

    def handle(self, *args, **options):
        hours = options["older_than_hours"]
        if hours < 1:
            # Below an hour a teacher still filling in the form could lose the file they just uploaded.
            raise CommandError("--older-than-hours must be at least 1.")
        dry_run = options["dry_run"]
        now = timezone.now()
        cutoff = now - timedelta(hours=hours)

        stale = File.objects.using(BYPASS_ALIAS).filter(
            entity_id__isnull=True, storage_provider="local", created_at__lt=cutoff
        )

        removed = freed_bytes = missing = 0
        for file in stale.iterator(chunk_size=500):
            if dry_run:
                removed += 1
                freed_bytes += file.size_bytes
                continue
            # Re-checked in the UPDATE itself: a form saved this very moment
            # may have just linked the file, and then it must stay.
            claimed = (
                File.objects.using(BYPASS_ALIAS)
                .filter(id=file.id, entity_id__isnull=True)
                .update(deleted_at=now, metadata={**file.metadata, "cleanup": "unlinked upload removed"})
            )
            if not claimed:
                continue
            removed += 1
            try:
                path = stored_file_path(file)
            except FileNotFoundError:
                missing += 1
                continue
            if path.exists():
                freed_bytes += file.size_bytes
                path.unlink()
            else:
                missing += 1

        partials = self._remove_stale_partials(cutoff, dry_run)

        verb = "Would remove" if dry_run else "Removed"
        self.stdout.write(
            f"{verb} {removed} unlinked uploads older than {hours}h ({freed_bytes / 1024 / 1024:.1f} MB), "
            f"{partials} unfinished .part files; {missing} had no file on disk."
        )

    def _remove_stale_partials(self, cutoff, dry_run: bool) -> int:
        root = Path(settings.MEDIA_ROOT)
        if not root.is_dir():
            return 0
        count = 0
        cutoff_ts = cutoff.timestamp()
        for partial in root.rglob("*.part"):
            if partial.is_file() and partial.stat().st_mtime < cutoff_ts:
                count += 1
                if not dry_run:
                    partial.unlink(missing_ok=True)
        return count
