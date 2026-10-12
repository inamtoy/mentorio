from django.db import models

from common.db import schema_table
from common.models import OrganizationScopedMixin, SoftDeleteMixin, TimestampedMixin, UUIDPrimaryKeyMixin

NOTIFICATION_TYPE_CHOICES = [
    ("info", "Info"),
    ("success", "Success"),
    ("warning", "Warning"),
    ("error", "Error"),
]


class Notification(UUIDPrimaryKeyMixin, TimestampedMixin, SoftDeleteMixin, OrganizationScopedMixin):
    """One user's inbox entry. Replaces four separate frontend-only mock
    Zustand stores (Admin/Teacher/Student — Super-Admin stays mock, it's
    platform-level and has no backend app at all yet) with a single
    org-scoped table, keyed by `recipient` rather than split by portal —
    "which portal renders it" is just "which role the recipient has",
    already known.

    `category` is a free-text label (not an enum) deliberately — the three
    portals' mock data used different, portal-specific category vocabularies
    (teacher: message/assignment/class/exam/admin; admin/student differ
    again) and forcing one shared enum across them would be rigidity with no
    real benefit; it only drives an icon/filter chip client-side.
    """

    recipient = models.ForeignKey(
        "foundation.User", on_delete=models.CASCADE, db_column="recipient_id", related_name="notifications"
    )
    sender = models.ForeignKey(
        "foundation.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        db_column="sender_id",
        related_name="sent_notifications",
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    type = models.CharField(max_length=20, choices=NOTIFICATION_TYPE_CHOICES, default="info")
    category = models.CharField(max_length=30, blank=True, default="")
    read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    # Set only on system-generated notifications ("absent:<attendance id>",
    # see notifications.services.events): one event notifies a recipient
    # once, however often the triggering write is repeated.
    event_key = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        db_table = schema_table("notification", "notifications")
        constraints = [
            models.UniqueConstraint(
                fields=["recipient", "event_key"],
                name="uq_notif_recipient_event",
                condition=models.Q(event_key__isnull=False),
            ),
        ]
        indexes = [
            models.Index(
                fields=["recipient", "read"], name="idx_notif_recipient_read", condition=models.Q(deleted_at__isnull=True)
            ),
            models.Index(
                fields=["organization"], name="idx_notif_org", condition=models.Q(deleted_at__isnull=True)
            ),
        ]

    def __str__(self) -> str:
        return f"{self.title} -> {self.recipient_id}"
