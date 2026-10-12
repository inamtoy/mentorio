from django.db import models

from common.db import schema_table
from common.models import OrganizationScopedMixin, TimestampedMixin, UUIDPrimaryKeyMixin

DELIVERY_CHANNEL_CHOICES = [
    ("telegram", "Telegram"),
]

DELIVERY_STATUS_CHOICES = [
    ("pending", "Pending"),
    ("sent", "Sent"),
    ("failed", "Failed"),
]


class NotificationDelivery(UUIDPrimaryKeyMixin, TimestampedMixin, OrganizationScopedMixin):
    """Outbox + delivery log for messages sent outside the app.

    Rows are written `pending` in the same transaction as the event that
    caused them (notifications.services.events), and only a worker
    (`manage.py send_notifications`) talks to Telegram — so a slow or down
    Telegram never slows or fails the request that marked a student absent,
    and a crash between "saved" and "sent" can't lose a message.

    `dedupe_key` is unique: re-marking a student absent, re-running the
    daily reminder job, or replaying a request creates nothing new.

    Exactly one recipient is set: `recipient_user` (a student's own
    account) or `student_parent` (a parent with no account). `notification`
    points at the in-app inbox row when there is one — parents have none.
    `text`/`chat_id` are copied at enqueue time so the log shows exactly
    what was sent where.
    """

    notification = models.ForeignKey(
        "notifications.Notification",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        db_column="notification_id",
        related_name="deliveries",
    )
    recipient_user = models.ForeignKey(
        "foundation.User",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        db_column="recipient_user_id",
        related_name="+",
    )
    student_parent = models.ForeignKey(
        "student.StudentParent",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        db_column="student_parent_id",
        related_name="+",
    )
    event = models.CharField(max_length=50)
    channel = models.CharField(max_length=20, choices=DELIVERY_CHANNEL_CHOICES, default="telegram")
    chat_id = models.BigIntegerField()
    text = models.TextField()
    status = models.CharField(max_length=20, choices=DELIVERY_STATUS_CHOICES, default="pending")
    attempts = models.SmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField()
    last_error = models.CharField(max_length=500, blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True)
    dedupe_key = models.CharField(max_length=255, unique=True)

    class Meta:
        db_table = schema_table("notification", "notification_deliveries")
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(recipient_user__isnull=False, student_parent__isnull=True)
                    | models.Q(recipient_user__isnull=True, student_parent__isnull=False)
                ),
                name="chk_deliveries_one_recipient",
            ),
        ]
        indexes = [
            models.Index(
                fields=["next_attempt_at"],
                name="idx_deliveries_pending",
                condition=models.Q(status="pending"),
            ),
            models.Index(fields=["organization", "-created_at"], name="idx_deliveries_org"),
        ]

    def __str__(self) -> str:
        return f"{self.event} -> {self.chat_id} ({self.status})"
