from django.contrib.auth.base_user import AbstractBaseUser
from django.db import models

from common.db import PhoneKey, schema_table
from common.models import OrganizationScopedMixin, SoftDeleteMixin, TimestampedMixin, UUIDPrimaryKeyMixin
from foundation.managers import UserManager

GENDER_CHOICES = [
    ("male", "Male"),
    ("female", "Female"),
    ("other", "Other"),
    ("prefer_not_to_say", "Prefer not to say"),
]

USER_STATUS_CHOICES = [
    ("active", "Active"),
    ("inactive", "Inactive"),
    ("suspended", "Suspended"),
    ("pending", "Pending"),
]


class User(
    AbstractBaseUser,
    UUIDPrimaryKeyMixin,
    TimestampedMixin,
    SoftDeleteMixin,
    OrganizationScopedMixin,
):
    """All platform users (super admins, center/branch admins, teachers,
    students, parents). No email/username login — see login_id below.
    """

    branch = models.ForeignKey(
        "foundation.Branch",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        db_column="branch_id",
    )

    # Globally unique, system-generated — see foundation/managers.py. This
    # is what a user actually types into the "Login" field on the frontend.
    # No email field exists on this model at all: login is by login_id, not
    # email, and phone is the sole real-world contact/verification channel
    # (see auth_custom.PhoneVerification) — there was never a code path that
    # read User.email for anything, so it cost real schema/index space for
    # zero functionality. Organization/Branch keep their own `email` field —
    # that's org contact info, unrelated to how a user logs in.
    login_id = models.CharField(max_length=32, unique=True, editable=False)

    # Also globally unique, also system-generated, but deliberately a
    # *different* value from login_id — reserved for the future Finance
    # module to reference in invoices/payments, so login credentials and
    # financial records never share an identifier.
    member_code = models.CharField(max_length=32, unique=True, editable=False)

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True, null=True)
    phone = models.CharField(max_length=20)
    password = models.CharField(max_length=255, db_column="password_hash")
    avatar_url = models.TextField(blank=True, null=True)
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES, blank=True, null=True)
    date_of_birth = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=USER_STATUS_CHOICES, default="pending")
    language = models.CharField(max_length=10, default="uz")
    # Overrides AbstractBaseUser.last_login (same field, just renamed to match
    # the DDL's `last_login_at` column and made non-editable — Django's own
    # login-signal machinery still updates it via the `last_login` attribute).
    last_login = models.DateTimeField(null=True, blank=True, db_column="last_login_at")
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    # Set when someone other than the user picked the current password (an
    # admin's reset) — the user must replace it before using anything else.
    # Enforced server-side in SessionValidatingJWTAuthentication, not just a
    # frontend redirect. Cleared by any self-chosen password (settings change
    # or Telegram reset).
    must_change_password = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = "login_id"
    REQUIRED_FIELDS = ["first_name", "last_name", "phone"]

    class Meta:
        db_table = schema_table("foundation", "users")
        indexes = [
            models.Index(
                fields=["organization"],
                name="idx_users_org_id",
                condition=models.Q(deleted_at__isnull=True),
            ),
            models.Index(
                fields=["organization", "status"],
                name="idx_users_org_status",
                condition=models.Q(deleted_at__isnull=True),
            ),
            models.Index(
                fields=["organization", "last_name", "first_name"],
                name="idx_users_name",
                condition=models.Q(deleted_at__isnull=True),
            ),
            # Telegram contact sharing looks users up by number across every
            # org (notifications.services.telegram_links) — free-text phones
            # need the normalized key indexed, not the raw column.
            models.Index(PhoneKey("phone"), name="idx_users_phone_key", condition=models.Q(deleted_at__isnull=True)),
        ]

    def __str__(self) -> str:
        return f"{self.first_name} {self.last_name} ({self.login_id})"

    def get_full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def get_short_name(self) -> str:
        return self.first_name
