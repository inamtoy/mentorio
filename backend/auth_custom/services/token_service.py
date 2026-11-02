from __future__ import annotations

from django.conf import settings
from django.utils import timezone
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken as SimpleJWTRefreshToken

from auth_custom.models import RefreshToken, Session
from auth_custom.services.session_service import BYPASS_ALIAS, create_session, hash_token
from common.audit import get_client_ip

MAX_ACTIVE_REFRESH_TOKENS = getattr(settings, "AUTH_MAX_ACTIVE_REFRESH_TOKENS", 5)


def issue_tokens_for_new_session(*, user, request) -> dict:
    """Login only: mints a token pair AND creates a new Session row (one
    "device" entry in the Active Sessions UI per login). Token refresh
    reuses the existing session instead — see rotate_tokens — otherwise
    every 15-minute access-token refresh would spam the sessions list with
    a new "device".
    """

    _enforce_max_active_tokens(user)

    session = create_session(user=user, organization=user.organization, request=request)
    return _mint_and_persist(user=user, session=session, request=request)


def rotate_tokens(*, raw_refresh_token: str, request) -> dict:
    """SIMPLE_JWT ROTATE_REFRESH_TOKENS=True means every refresh call must
    return a *new* refresh token too, not just a new access token — the old
    one is single-use. The session itself (and its row in the Active
    Sessions UI) stays the same; only the token material rotates.
    """

    try:
        old_token = SimpleJWTRefreshToken(raw_refresh_token)
    except TokenError as exc:
        raise ValueError("Invalid or expired refresh token.") from exc

    old_hash = hash_token(raw_refresh_token)
    stored = RefreshToken.objects.using(BYPASS_ALIAS).filter(token_hash=old_hash, status="active").first()
    if stored is None:
        raise ValueError("Refresh token has been revoked or does not exist.")

    session_id = old_token.get("session_id")
    session = Session.objects.using(BYPASS_ALIAS).filter(pk=session_id, is_active=True).first()
    if session is None:
        raise ValueError("Session has been revoked or expired.")

    from foundation.models import User  # local import: avoids app-loading cycle
    from foundation.services import primary_role_slug  # local import: avoids app-loading cycle

    user = User.objects.using(BYPASS_ALIAS).get(pk=old_token[settings.SIMPLE_JWT["USER_ID_CLAIM"]])

    stored.status = "revoked"
    stored.revoked_at = timezone.now()
    stored.revoked_reason = "rotated"
    stored.save(using=BYPASS_ALIAS, update_fields=["status", "revoked_at", "revoked_reason"])

    Session.objects.using(BYPASS_ALIAS).filter(pk=session.pk).update(last_activity_at=timezone.now())

    tokens = _mint_and_persist(user=user, session=session, request=request)
    tokens["role"] = primary_role_slug(user, using=BYPASS_ALIAS)
    return tokens


def _mint_and_persist(*, user, session: Session, request) -> dict:
    refresh = SimpleJWTRefreshToken.for_user(user)
    refresh["org_id"] = str(user.organization_id)
    refresh["session_id"] = str(session.id)
    access = refresh.access_token  # derived after claims are set, so it inherits them

    RefreshToken.objects.using(BYPASS_ALIAS).create(
        user=user,
        organization=user.organization,
        token_hash=hash_token(str(refresh)),
        device_info=request.META.get("HTTP_USER_AGENT", "")[:500],
        ip_address=get_client_ip(request),
        status="active",
        expires_at=timezone.now() + settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"],
    )
    return {"access": str(access), "refresh": str(refresh)}


def _enforce_max_active_tokens(user) -> None:
    """DDL comment: "max 5 active per user" — not a DB constraint, enforced
    here by revoking the oldest active token once the limit is reached."""

    active = (
        RefreshToken.objects.using(BYPASS_ALIAS)
        .filter(user=user, status="active")
        .order_by("created_at")
    )
    excess = active.count() - (MAX_ACTIVE_REFRESH_TOKENS - 1)
    if excess > 0:
        for token in active[:excess]:
            token.status = "revoked"
            token.revoked_at = timezone.now()
            token.revoked_reason = "max_active_exceeded"
            token.save(using=BYPASS_ALIAS, update_fields=["status", "revoked_at", "revoked_reason"])


def revoke_refresh_token(raw_token: str, *, reason: str = "logout") -> None:
    RefreshToken.objects.using(BYPASS_ALIAS).filter(token_hash=hash_token(raw_token), status="active").update(
        status="revoked", revoked_at=timezone.now(), revoked_reason=reason
    )
