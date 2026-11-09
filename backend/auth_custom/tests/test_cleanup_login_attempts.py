"""cleanup_login_attempts: retention for auth.login_attempts."""

from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import CommandError, call_command
from django.utils import timezone

from auth_custom.models import LoginAttempt

# Same reasoning as test_login.py: the command uses the separate
# auth_bypass_rls connection, which only sees committed rows.
pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _attempt(login_id: str, age: timedelta) -> LoginAttempt:
    row = LoginAttempt.objects.using(BYPASS_ALIAS).create(
        login_id=login_id, status="failed", ip_address="203.0.113.7", failure_reason="invalid_credentials"
    )
    # created_at is auto_now_add, so backdate it after the insert.
    LoginAttempt.objects.using(BYPASS_ALIAS).filter(pk=row.pk).update(created_at=timezone.now() - age)
    return row


def _run(*args) -> str:
    out = StringIO()
    call_command("cleanup_login_attempts", *args, stdout=out)
    return out.getvalue()


def test_deletes_only_attempts_older_than_retention():
    old = _attempt("old-attempt", timedelta(days=31))
    recent = _attempt("recent-attempt", timedelta(days=29))

    output = _run()

    remaining = set(LoginAttempt.objects.using(BYPASS_ALIAS).filter(pk__in=[old.pk, recent.pk]).values_list("pk", flat=True))
    assert remaining == {recent.pk}
    assert "Deleted 1 login attempts older than 30 days." in output


def test_dry_run_changes_nothing():
    old = _attempt("old-attempt", timedelta(days=40))

    output = _run("--dry-run")

    assert LoginAttempt.objects.using(BYPASS_ALIAS).filter(pk=old.pk).exists()
    assert "Would delete 1 login attempts older than 30 days." in output


def test_custom_retention_days():
    row = _attempt("ten-days-old", timedelta(days=10))

    _run("--days", "7")

    assert not LoginAttempt.objects.using(BYPASS_ALIAS).filter(pk=row.pk).exists()


def test_rejects_retention_below_one_day():
    with pytest.raises(CommandError):
        _run("--days", "0")
