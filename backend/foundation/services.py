from __future__ import annotations

import os
import re
import shutil
import subprocess

# Platform-wide config, stored as one row per panel in the generic
# foundation.Setting table (scope="platform", organization/branch/user all
# NULL — a singleton per key) rather than a dedicated model: only two
# panels (General, Security) are real this phase — Theme/Languages/Email/
# SMS/Backup/API-Keys stay frontend-mock (see the plan doc) — and a flat
# JSON blob per panel matches the Super-Admin Settings page's own form
# shape without inventing a schema for settings that don't persist yet.
DEFAULT_GENERAL_SETTINGS: dict = {
    "platformName": "Mentorio",
    "tagline": "The All-in-One LMS Platform",
    "supportEmail": "support@mentorio.com",
    # Relative path, deliberately not an absolute URL — served from the
    # frontend's own public/ directory (see frontend/app/(auth)/login/
    # page.tsx), so the browser resolves it against whatever origin the
    # login page itself was loaded from, regardless of where the API lives.
    "logoUrl": "/logo-mentorio.png",
    "faviconUrl": None,
}

# twoFactor/ipAllowlist/sessionTimeoutMinutes are stored here but NOT yet
# enforced anywhere (2FA challenge flow, an IP-blocking middleware, and a
# per-request-configurable JWT lifetime are each their own future project —
# see the plan doc's explicit call on this). maxLoginAttempts *is* enforced,
# by auth_custom.views.LoginView; passwordPolicy *is* enforced, by
# foundation.password_policy.validate_password_policy — both are cheap,
# self-contained checks against data this app already writes on every
# request (LoginAttempt) or already validates (a new password).
DEFAULT_SECURITY_SETTINGS: dict = {
    "twoFactor": False,
    "sessionTimeoutMinutes": 60,
    "ipAllowlist": False,
    "maxLoginAttempts": 5,
    "passwordPolicy": "basic",
}

# darkMode/compactSidebar/primaryColor/fontFamily are applied by
# frontend/components/layout/theme-applier.tsx, read via the public
# PlatformBrandingView (not just the authenticated PlatformSettingsView) so
# every portal's shell — not only Super-Admin's own screen — reflects them.
# Deliberately scoped to the shared shell (Button/Card/Sidebar/Header), not
# a full per-page retrofit — see the plan doc this shipped against for why
# (most of the app hardcodes Tailwind color literals rather than these
# tokens; retrofitting every page is its own separate project).
DEFAULT_THEME_SETTINGS: dict = {
    "darkMode": False,
    "compactSidebar": False,
    "primaryColor": "#6366f1",
    "fontFamily": "inter",
}

# Only the 3 locales frontend/i18n/locales.ts actually ships translations
# for — no independent source of truth across the language boundary, so
# this list is kept in sync with LOCALES by hand (same duplication as
# `passwordPolicy`'s enum below). `default` must stay in `enabled` — the
# frontend already enforces "can't disable the default language" in the UI;
# this is the same rule enforced server-side.
LANGUAGE_CODES = ("en", "uz", "ru")
DEFAULT_LANGUAGES_SETTINGS: dict = {
    "enabled": ["en", "uz", "ru"],
    "default": "uz",
}

DEFAULT_EMAIL_SETTINGS: dict = {
    "smtpHost": "",
    "smtpPort": 587,
    "username": "",
    "password": "",
    "fromName": "Mentorio Platform",
    "tlsEnabled": True,
}

DEFAULT_SMS_SETTINGS: dict = {
    "provider": "twilio",
    "accountSid": "",
    "authToken": "",
    "fromNumber": "",
    "enabled": False,
}

PLATFORM_SETTINGS_DEFAULTS: dict[str, dict] = {
    "general": DEFAULT_GENERAL_SETTINGS,
    "security": DEFAULT_SECURITY_SETTINGS,
    "theme": DEFAULT_THEME_SETTINGS,
    "languages": DEFAULT_LANGUAGES_SETTINGS,
    "email": DEFAULT_EMAIL_SETTINGS,
    "sms": DEFAULT_SMS_SETTINGS,
}

# Secret fields that must never be echoed back on a GET and must survive a
# PUT that doesn't resend them — see mask_platform_setting_secrets() and
# sanitize_platform_setting_incoming() below.
PLATFORM_SETTINGS_SECRET_FIELDS: dict[str, str] = {
    "email": "password",
    "sms": "authToken",
}


def get_platform_setting(key: str, *, using: str | None = None) -> dict:
    """Merges whatever's actually stored under PLATFORM_SETTINGS_DEFAULTS[key]
    so a freshly-migrated platform (no row yet) still returns a complete,
    sane shape, and adding a new field to the defaults later doesn't need a
    data migration for installs that already have a row.
    """
    from foundation.models import Setting

    qs = Setting.objects.filter(
        scope="platform", organization__isnull=True, branch__isnull=True, user__isnull=True, key=key
    )
    if using:
        qs = qs.using(using)
    row = qs.first()
    defaults = PLATFORM_SETTINGS_DEFAULTS.get(key, {})
    return {**defaults, **(row.value if row else {})}


def set_platform_setting(key: str, value: dict):
    from foundation.models import Setting

    setting, _created = Setting.objects.update_or_create(
        scope="platform", organization=None, branch=None, user=None, key=key,
        defaults={"value": value},
    )
    return setting


def mask_platform_setting_secrets(key: str, value: dict) -> dict:
    """Never echoes a stored secret back on GET (Email's `password`, SMS's
    `authToken`) — the panel gets a `has<Field>` boolean instead, so the UI
    can show "a password is set" without ever re-displaying it. Matches
    CLAUDE.md's "never log passwords" the same way this data must also
    never round-trip through a GET response. Every other key passes through
    unchanged.
    """
    secret_field = PLATFORM_SETTINGS_SECRET_FIELDS.get(key)
    if not secret_field:
        return value
    masked = {k: v for k, v in value.items() if k != secret_field}
    flag_name = f"has{secret_field[0].upper()}{secret_field[1:]}"
    masked[flag_name] = bool(value.get(secret_field))
    return masked


def sanitize_platform_setting_incoming(key: str, incoming: dict) -> dict:
    """Drops a blank/omitted secret field from an incoming PUT payload
    before it's merged onto the current stored value — otherwise saving the
    rest of the Email/SMS panel without retyping the password/auth token
    (the GET response never contains the real one to prefill, per
    mask_platform_setting_secrets() above) would overwrite the real stored
    secret with an empty string. PlatformSettingsView.put()'s existing
    `{**get_platform_setting(key), **incoming}` merge then naturally keeps
    whatever's already stored for that field.
    """
    secret_field = PLATFORM_SETTINGS_SECRET_FIELDS.get(key)
    if secret_field and not incoming.get(secret_field):
        return {k: v for k, v in incoming.items() if k != secret_field}
    return incoming


def _validate_general_setting(value: dict) -> None:
    from rest_framework.exceptions import ValidationError

    string_fields = {"platformName", "tagline", "supportEmail"}
    nullable_string_fields = {"logoUrl", "faviconUrl"}
    for field, val in value.items():
        if field in string_fields and not isinstance(val, str):
            raise ValidationError({field: "Must be a string."})
        if field in nullable_string_fields and val is not None and not isinstance(val, str):
            raise ValidationError({field: "Must be a string or null."})


def _validate_security_setting(value: dict) -> None:
    from rest_framework.exceptions import ValidationError

    # Real checks — this data isn't just displayed back, it's read by
    # LoginView's lockout check and password_policy.validate_password_policy
    # on every login/password-set platform-wide. A malformed value here
    # (e.g. maxLoginAttempts as a string) would 500 those, not just this
    # endpoint — see the finding this fixes.
    if "twoFactor" in value and not isinstance(value["twoFactor"], bool):
        raise ValidationError({"twoFactor": "Must be a boolean."})
    if "ipAllowlist" in value and not isinstance(value["ipAllowlist"], bool):
        raise ValidationError({"ipAllowlist": "Must be a boolean."})
    if "sessionTimeoutMinutes" in value:
        v = value["sessionTimeoutMinutes"]
        if not isinstance(v, int) or isinstance(v, bool) or v <= 0:
            raise ValidationError({"sessionTimeoutMinutes": "Must be a positive integer."})
    if "maxLoginAttempts" in value:
        v = value["maxLoginAttempts"]
        if not isinstance(v, int) or isinstance(v, bool) or v < 0:
            raise ValidationError({"maxLoginAttempts": "Must be a non-negative integer."})
    if "passwordPolicy" in value and value["passwordPolicy"] not in ("basic", "medium", "strong"):
        raise ValidationError({"passwordPolicy": "Must be one of: basic, medium, strong."})


_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
FONT_FAMILY_CHOICES = ("inter", "roboto", "outfit", "system")


def _validate_theme_setting(value: dict) -> None:
    from rest_framework.exceptions import ValidationError

    if "darkMode" in value and not isinstance(value["darkMode"], bool):
        raise ValidationError({"darkMode": "Must be a boolean."})
    if "compactSidebar" in value and not isinstance(value["compactSidebar"], bool):
        raise ValidationError({"compactSidebar": "Must be a boolean."})
    if "primaryColor" in value:
        v = value["primaryColor"]
        if not isinstance(v, str) or not _HEX_COLOR_RE.match(v):
            raise ValidationError({"primaryColor": "Must be a #rrggbb hex color."})
    if "fontFamily" in value and value["fontFamily"] not in FONT_FAMILY_CHOICES:
        raise ValidationError({"fontFamily": f"Must be one of: {', '.join(FONT_FAMILY_CHOICES)}."})


def _validate_languages_setting(value: dict) -> None:
    from rest_framework.exceptions import ValidationError

    enabled = value.get("enabled")
    if enabled is not None:
        if not isinstance(enabled, list) or not enabled or any(code not in LANGUAGE_CODES for code in enabled):
            raise ValidationError({"enabled": f"Must be a non-empty list drawn from: {', '.join(LANGUAGE_CODES)}."})
    if "default" in value:
        default = value["default"]
        # Checked against whichever `enabled` list is actually in effect —
        # the one in this same payload if present, otherwise the currently
        # stored one — so "default" can never end up pointing at a
        # language that isn't (or is no longer) enabled.
        effective_enabled = enabled if enabled is not None else get_platform_setting("languages")["enabled"]
        if default not in LANGUAGE_CODES or default not in effective_enabled:
            raise ValidationError({"default": "Must be one of the enabled languages."})


def _validate_email_setting(value: dict) -> None:
    from rest_framework.exceptions import ValidationError

    string_fields = {"smtpHost", "username", "password", "fromName"}
    for field in string_fields & value.keys():
        if not isinstance(value[field], str):
            raise ValidationError({field: "Must be a string."})
    if "smtpPort" in value:
        v = value["smtpPort"]
        if not isinstance(v, int) or isinstance(v, bool) or not (1 <= v <= 65535):
            raise ValidationError({"smtpPort": "Must be an integer between 1 and 65535."})
    if "tlsEnabled" in value and not isinstance(value["tlsEnabled"], bool):
        raise ValidationError({"tlsEnabled": "Must be a boolean."})


SMS_PROVIDER_CHOICES = ("twilio", "nexmo", "aws-sns", "custom")


def _validate_sms_setting(value: dict) -> None:
    from rest_framework.exceptions import ValidationError

    if "provider" in value and value["provider"] not in SMS_PROVIDER_CHOICES:
        raise ValidationError({"provider": f"Must be one of: {', '.join(SMS_PROVIDER_CHOICES)}."})
    string_fields = {"accountSid", "authToken", "fromNumber"}
    for field in string_fields & value.keys():
        if not isinstance(value[field], str):
            raise ValidationError({field: "Must be a string."})
    if "enabled" in value and not isinstance(value["enabled"], bool):
        raise ValidationError({"enabled": "Must be a boolean."})


PLATFORM_SETTINGS_VALIDATORS = {
    "general": _validate_general_setting,
    "security": _validate_security_setting,
    "theme": _validate_theme_setting,
    "languages": _validate_languages_setting,
    "email": _validate_email_setting,
    "sms": _validate_sms_setting,
}


# ─── Per-user settings (Admin/Teacher/Student Settings' Region tab) ────────
# Same `foundation.Setting` table, `scope="user"` instead of "platform" —
# self-service, no RBAC gate needed (a user always manages their own row,
# like changing their own password), unlike the platform-wide panels above.

DEFAULT_REGION_SETTINGS: dict = {
    # Uzbekistan-first default per CLAUDE.md's target market — the mock
    # `useState` this replaces defaulted to "America/New_York"/"MM/DD/YYYY"
    # on 2 of the 3 portals, a leftover generic-template value.
    "timezone": "Asia/Tashkent",
    "dateFormat": "DD/MM/YYYY",
}

DATE_FORMAT_CHOICES = ("MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD")


def _validate_region_setting(value: dict) -> None:
    from rest_framework.exceptions import ValidationError
    from zoneinfo import available_timezones

    if "timezone" in value:
        v = value["timezone"]
        if not isinstance(v, str) or v not in available_timezones():
            raise ValidationError({"timezone": "Must be a valid IANA timezone name."})
    if "dateFormat" in value and value["dateFormat"] not in DATE_FORMAT_CHOICES:
        raise ValidationError({"dateFormat": f"Must be one of: {', '.join(DATE_FORMAT_CHOICES)}."})


USER_SETTINGS_DEFAULTS: dict[str, dict] = {
    "region": DEFAULT_REGION_SETTINGS,
}

USER_SETTINGS_VALIDATORS = {
    "region": _validate_region_setting,
}


def get_user_setting(user, key: str) -> dict:
    """Same shape as get_platform_setting() but `scope="user"` — each user's
    own row, hierarchical-override table already supports this via
    `foundation.Setting`'s existing scope column, no schema change needed.
    """
    from foundation.models import Setting

    row = Setting.objects.filter(scope="user", organization__isnull=True, branch__isnull=True, user=user, key=key).first()
    defaults = USER_SETTINGS_DEFAULTS.get(key, {})
    return {**defaults, **(row.value if row else {})}


def set_user_setting(user, key: str, value: dict):
    from foundation.models import Setting

    setting, _created = Setting.objects.update_or_create(
        scope="user", organization=None, branch=None, user=user, key=key,
        defaults={"value": value},
    )
    return setting


# ─── Platform Backups (Super-Admin Settings' Backup panel) ─────────────────

def run_platform_backup(triggered_by):
    """Shells out to `pg_dump` (custom format) using the `auth_bypass_rls`
    connection's credentials — NOT `DATABASES["default"]`. `educore_app`
    (the "default" role) only ever queries with `FORCE ROW LEVEL SECURITY`
    tables filtered by an `app.current_org_id`/`app.current_user_id` GUC
    that a plain `pg_dump` connection never sets, so a dump taken as that
    role fails outright ("query would be affected by row-level security
    policy"). `educore_auth_bypass` has the `BYPASSRLS` role attribute
    (see backend/README.md's role-setup block) — same role already used
    for every other "no request-scoped org context exists here" read in
    this codebase (PlatformBrandingView, the login lookup). No task queue
    exists anywhere in this backend (see reports/views.py's module
    docstring for the same constraint driving a design choice) so this
    runs synchronously in the request — acceptable for an admin-triggered,
    infrequent action, same tradeoff already accepted elsewhere here.

    Honest failure mode: if `pg_dump` isn't installed/on PATH, or the dump
    itself fails, the row records `status="failed"` with the real error —
    never a silent/fake success.
    """
    from django.conf import settings as django_settings
    from django.utils import timezone

    from foundation.models import PlatformBackup

    backup = PlatformBackup.objects.create(status="running", triggered_by=triggered_by, started_at=timezone.now())

    pg_dump = shutil.which("pg_dump")
    if pg_dump is None:
        backup.status = "failed"
        backup.error_message = "pg_dump is not installed or not on PATH on this server."
        backup.finished_at = timezone.now()
        backup.save(update_fields=["status", "error_message", "finished_at"])
        return backup

    django_settings.BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    dest = django_settings.BACKUP_DIR / f"backup_{backup.id}.dump"
    db = django_settings.DATABASES["auth_bypass_rls"]

    try:
        subprocess.run(
            [pg_dump, "-h", db["HOST"], "-p", str(db["PORT"]), "-U", db["USER"], "-Fc", "-f", str(dest), db["NAME"]],
            check=True, capture_output=True, text=True, timeout=300,
            env={**os.environ, "PGPASSWORD": db["PASSWORD"]},
        )
        backup.status = "success"
        backup.size_bytes = dest.stat().st_size
        backup.storage_path = str(dest)
    except subprocess.CalledProcessError as exc:
        backup.status = "failed"
        backup.error_message = (exc.stderr or str(exc))[:2000]
    except subprocess.TimeoutExpired:
        backup.status = "failed"
        backup.error_message = "Backup timed out after 300 seconds."
    finally:
        backup.finished_at = timezone.now()
        backup.save(update_fields=["status", "size_bytes", "storage_path", "error_message", "finished_at"])

    return backup


# ─── API Keys (Super-Admin Settings' API Keys panel) ───────────────────────

def generate_api_key(name: str, created_by):
    """Returns `(ApiKey, raw_key)` — `raw_key` is never persisted anywhere
    and this is the only time it's ever returned; only its SHA-256 hash and
    a 16-char prefix (for the UI to show *which* key a row is) are stored.
    """
    import hashlib
    import secrets

    from foundation.models import ApiKey

    raw_key = "mk_live_" + secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    api_key = ApiKey.objects.create(name=name, key_prefix=raw_key[:16], key_hash=key_hash, created_by=created_by)
    return api_key, raw_key


def rotate_api_key(api_key, created_by):
    """Revokes `api_key` and immediately issues its replacement (same
    name) — the caller gets the new raw key back the same one-time way
    generate_api_key() returns it.
    """
    from django.utils import timezone

    api_key.revoked_at = timezone.now()
    api_key.save(update_fields=["revoked_at"])
    return generate_api_key(api_key.name, created_by)


# ─── Email/SMS test-send (Super-Admin Settings' Email/SMS panels) ──────────
# Both are genuine attempts against the stored provider config — they will
# only actually succeed once real credentials are entered (this repo ships
# no default mail server or SMS account) — and both return (ok, message)
# rather than raising: a provider-side failure (wrong password, refused
# connection, invalid number) is an expected, displayable result here, not
# a 500.

def send_test_email(to: str) -> tuple[bool, str]:
    from django.core.mail import EmailMessage, get_connection

    email_settings = get_platform_setting("email")
    if not email_settings.get("smtpHost"):
        return False, "No SMTP host configured yet."

    try:
        connection = get_connection(
            backend="django.core.mail.backends.smtp.EmailBackend",
            host=email_settings["smtpHost"],
            port=email_settings.get("smtpPort") or 587,
            username=email_settings.get("username") or None,
            password=email_settings.get("password") or None,
            use_tls=bool(email_settings.get("tlsEnabled")),
            timeout=10,
        )
        EmailMessage(
            subject="Mentorio test email",
            body="This is a test email from Mentorio's Super-Admin Settings.",
            from_email=email_settings.get("fromName") or "Mentorio",
            to=[to],
            connection=connection,
        ).send(fail_silently=False)
        return True, f"Test email sent to {to}."
    except Exception as exc:  # noqa: BLE001 — any SMTP/network failure is a displayable result here
        return False, str(exc)


def send_test_sms(to: str) -> tuple[bool, str]:
    """Only Twilio is actually wired — stdlib `urllib` only, no `twilio`/
    `requests` dependency added for this one call site (see
    backend/pyproject.toml). Any other configured provider returns an
    explicit "not implemented" result rather than a fake success.
    """
    import base64
    import json
    import urllib.error
    import urllib.parse
    import urllib.request

    sms_settings = get_platform_setting("sms")
    if not sms_settings.get("enabled"):
        return False, "SMS is not enabled."
    if sms_settings.get("provider") != "twilio":
        return False, f"Test send isn't implemented for provider '{sms_settings.get('provider')}' yet — only Twilio is wired."

    account_sid, auth_token, from_number = (
        sms_settings.get("accountSid"), sms_settings.get("authToken"), sms_settings.get("fromNumber"),
    )
    if not (account_sid and auth_token and from_number):
        return False, "Account SID, auth token, and from-number are all required."

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    data = urllib.parse.urlencode({"To": to, "From": from_number, "Body": "Test SMS from Mentorio."}).encode()
    credentials = base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode()
    request = urllib.request.Request(url, data=data, method="POST")
    request.add_header("Authorization", f"Basic {credentials}")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = json.loads(response.read())
            return True, f"Test SMS sent (sid={body.get('sid')})."
    except urllib.error.HTTPError as exc:
        return False, f"Twilio rejected the request: {exc.read().decode(errors='ignore')[:300]}"
    except urllib.error.URLError as exc:
        return False, f"Could not reach Twilio: {exc.reason}"


def provision_default_roles(organization) -> None:
    """Every organization gets its own center_admin/teacher/student Role
    rows (idempotent) the moment it's created, each pre-linked to a sane
    default permission set — see foundation/permissions_catalog.py for both.
    Called from the post_save signal on Organization (foundation/signals.py)
    so it fires regardless of whether the org was created via the API, a
    management command, or a test — not just one call site to remember.

    Deliberately org-scoped (organization=<this org>), not organization=None
    like super_admin: a null-organization role would satisfy
    foundation.is_platform_user()'s `organization_id IS NULL` check and grant
    every teacher/student cross-organization RLS visibility, which is not
    what these roles are meant to do.
    """

    from foundation.models import Permission, Role, RolePermission
    from foundation.permissions_catalog import DEFAULT_ROLE_NAMES, DEFAULT_ROLE_PERMISSIONS

    for slug, permission_pairs in DEFAULT_ROLE_PERMISSIONS.items():
        role, _created = Role.objects.get_or_create(
            organization=organization,
            slug=slug,
            defaults={"name": DEFAULT_ROLE_NAMES[slug], "is_system": False, "is_active": True},
        )
        for module, action in permission_pairs:
            permission = Permission.objects.filter(module=module, action=action).first()
            if permission is None:
                continue  # catalog/migration out of sync — skip rather than crash org creation
            RolePermission.objects.get_or_create(role=role, permission=permission)


def primary_role_slug(user, *, using: str | None = None) -> str | None:
    """Which of a user's roles determines their portal. A system-level role
    (organization IS NULL, e.g. super_admin) wins over an org-scoped one —
    same priority already used by foundation.is_platform_user() (SQL, see
    migrations/0004_rls.py) and common/permissions.py::user_has_permission
    (Python) for the same "system role implies full access" rule.
    """

    from foundation.models import UserRole

    qs = UserRole.objects.filter(user=user, role__is_active=True).select_related("role")
    if using:
        qs = qs.using(using)

    system_role = next((ur.role for ur in qs if ur.role.organization_id is None), None)
    if system_role:
        return system_role.slug

    org_role = next(iter(qs), None)
    return org_role.role.slug if org_role else None
