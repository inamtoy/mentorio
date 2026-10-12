from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from auth_custom.models import LoginAttempt, Session
from auth_custom.serializers import LoginSerializer, SessionSerializer
from auth_custom.services import token_service
from auth_custom.services.session_service import BYPASS_ALIAS, revoke_session
from common.audit import audit_log
from common.cookies import REFRESH_COOKIE, clear_auth_cookies, set_auth_cookies
from foundation.models import User
from foundation.services import get_platform_setting, primary_role_slug

# How far back "recent failures" looks for the Max Login Attempts lockout —
# self-recovers once a login_id's failures age out of this window, rather
# than needing an admin "unlock" action.
LOGIN_LOCKOUT_WINDOW = timedelta(minutes=30)


class LoginView(APIView):
    """No email — login_id + password (see plan decision 2). This whole
    request runs before any org context exists (that's what it establishes),
    so every DB access here deliberately goes through the BYPASSRLS
    connection alias, not just the initial lookup.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get_authenticate_header(self, request):
        # With authentication_classes=[], DRF's default exception handler
        # has no WWW-Authenticate header to report and silently downgrades
        # AuthenticationFailed (bad login_id/password, suspended account)
        # from 401 to 403 — this restores the correct 401.
        return "Bearer"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        login_id = serializer.validated_data["login_id"]
        password = serializer.validated_data["password"]

        self._enforce_lockout(request, login_id)

        user = User.objects.using(BYPASS_ALIAS).filter(login_id=login_id).first()

        if user is None or not user.check_password(password):
            self._log_attempt(request, login_id, user, "failed", "invalid_credentials")
            raise AuthenticationFailed("Invalid login ID or password.")

        if user.status != "active":
            self._log_attempt(request, login_id, user, "blocked", f"account_{user.status}")
            raise AuthenticationFailed(f"Account is {user.status}.")

        tokens = token_service.issue_tokens_for_new_session(user=user, request=request)
        role = primary_role_slug(user, using=BYPASS_ALIAS)

        User.objects.using(BYPASS_ALIAS).filter(pk=user.pk).update(last_login=timezone.now())
        self._log_attempt(request, login_id, user, "success", None)
        audit_log(request, action="login", entity_type="user", entity_id=str(user.id), user=user, using=BYPASS_ALIAS)

        response = Response(
            {
                "success": True,
                "message": "Logged in",
                "data": {
                    "user": {
                        "id": str(user.id),
                        "login_id": user.login_id,
                        "full_name": user.get_full_name(),
                        "organization_id": str(user.organization_id),
                        "status": user.status,
                        "role": role,
                        # Seeds the frontend's locale cookie on a device that
                        # hasn't picked one yet — see lib/api/auth.ts's login().
                        "language": user.language,
                    },
                },
            }
        )
        set_auth_cookies(response, access=tokens["access"], refresh=tokens["refresh"], role=role)
        return response

    def _enforce_lockout(self, request, login_id: str) -> None:
        """Max Login Attempts (Super-Admin Settings' Security panel) —
        counts recent `failed` LoginAttempt rows for this (login_id,
        ip_address) pair (already written on every attempt by _log_attempt
        below) within a rolling window and blocks further tries once the
        threshold's hit. 0 or unset disables the check entirely.

        Scoped by IP as well as login_id, not login_id alone: a lockout
        keyed only on login_id would let anyone who merely knows a victim's
        login_id (their phone number) lock them out of their own account
        by spamming wrong passwords from anywhere — the legitimate user's
        own attempts, from their own IP, would then also be blocked. This
        doesn't stop a *distributed* brute force (an attacker rotating IPs
        never accumulates enough failures on any single one to trip the
        lockout) — that's a materially harder problem than what Max Login
        Attempts is meant to cheaply solve here.
        """
        max_attempts = get_platform_setting("security", using=BYPASS_ALIAS).get("maxLoginAttempts", 5)
        if not max_attempts or max_attempts <= 0:
            return
        window_start = timezone.now() - LOGIN_LOCKOUT_WINDOW
        recent_failures = LoginAttempt.objects.using(BYPASS_ALIAS).filter(
            login_id=login_id, ip_address=request.META.get("REMOTE_ADDR"), status="failed", created_at__gte=window_start
        ).count()
        if recent_failures >= max_attempts:
            self._log_attempt(request, login_id, None, "blocked", "too_many_attempts")
            raise AuthenticationFailed(
                f"Too many failed login attempts. Try again in {int(LOGIN_LOCKOUT_WINDOW.total_seconds() // 60)} minutes."
            )

    @staticmethod
    def _log_attempt(request, login_id: str, user, status_value: str, reason: str | None) -> None:
        LoginAttempt.objects.using(BYPASS_ALIAS).create(
            organization=user.organization if user else None,
            user=user,
            login_id=login_id,
            status=status_value,
            ip_address=request.META.get("REMOTE_ADDR"),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            failure_reason=reason,
        )


class RefreshView(APIView):
    """SIMPLE_JWT ROTATE_REFRESH_TOKENS=True means the client gets a new
    refresh token on every call too (single-use) — this reuses the existing
    Session row rather than creating a new one, so the Active Sessions UI
    doesn't get a new "device" entry every 15 minutes.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get_authenticate_header(self, request):
        # Same fix as LoginView.get_authenticate_header — otherwise an
        # invalid/expired refresh token would 403 instead of 401.
        return "Bearer"

    def post(self, request):
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if not raw_refresh:
            raise AuthenticationFailed("No refresh token cookie present.")

        try:
            tokens = token_service.rotate_tokens(raw_refresh_token=raw_refresh, request=request)
        except ValueError as exc:
            # A dead refresh token (expired/revoked) must not linger in the
            # browser: proxy.ts treats its mere presence as "signed in" and
            # would keep rendering portal shells instead of /login.
            response = Response(
                {"success": False, "message": f"{exc} Please sign in again.", "data": None},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_auth_cookies(response)
            return response

        response = Response({"success": True, "message": "", "data": None})
        set_auth_cookies(response, access=tokens["access"], refresh=tokens["refresh"], role=tokens.get("role"))
        return response


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        raw_refresh = request.COOKIES.get(REFRESH_COOKIE)
        if raw_refresh:
            token_service.revoke_refresh_token(raw_refresh, reason="logout")

        session_id = request.auth.get("session_id") if request.auth else None
        if session_id:
            # Deliberately the default (RLS, non-bypass) connection, not
            # BYPASS_ALIAS: by this point the request is already
            # authenticated and org-scoped, so RLS's own-org policy already
            # covers it. Using BYPASS_ALIAS here previously deadlocked —
            # SessionValidatingJWTAuthentication's last_activity_at UPDATE
            # on this exact row (via `default`, inside the request-wide
            # transaction.atomic() from OrganizationContextMiddleware) holds
            # a row lock until the request finishes, and a second UPDATE on
            # the SAME row from a second, separate connection (BYPASS_ALIAS)
            # then blocks waiting for a commit that can't happen until that
            # second UPDATE itself returns — a guaranteed self-deadlock on
            # every logout call.
            session = Session.objects.filter(pk=session_id).first()
            if session:
                revoke_session(session, reason="logout")

        audit_log(request, action="logout", entity_type="user", entity_id=str(request.user.id))
        response = Response({"success": True, "message": "Logged out", "data": None})
        clear_auth_cookies(response)
        return response


class SessionListView(APIView):
    def get(self, request):
        sessions = Session.objects.filter(user=request.user, is_active=True).order_by("-last_activity_at")
        current_session_id = request.auth.get("session_id") if request.auth else None
        serializer = SessionSerializer(sessions, many=True, context={"current_session_id": current_session_id})
        return Response({"success": True, "message": "", "data": serializer.data})


class SessionRevokeView(APIView):
    def post(self, request, session_id):
        session = Session.objects.filter(pk=session_id, user=request.user, is_active=True).first()
        if session is None:
            return Response(
                {"success": False, "message": "Session not found.", "data": None},
                status=status.HTTP_404_NOT_FOUND,
            )

        current_session_id = request.auth.get("session_id") if request.auth else None
        if str(session.id) == str(current_session_id):
            return Response(
                {"success": False, "message": "Cannot revoke your current session — use logout instead.", "data": None},
                status=status.HTTP_400_BAD_REQUEST,
            )

        revoke_session(session, reason="user_revoked")
        audit_log(request, action="update", entity_type="session", entity_id=str(session.id))
        return Response({"success": True, "message": "Session revoked", "data": None})
