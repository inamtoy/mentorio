from django.conf import settings

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
ROLE_COOKIE = "user_role"


def set_auth_cookies(response, *, access: str, refresh: str, role: str | None = None) -> None:
    """httpOnly cookies are the only place the raw JWTs live client-side —
    the frontend never reads or stores them; the browser just carries them
    back automatically. `secure=not settings.DEBUG` because local dev runs
    over plain http.

    `role` (the user's primary role slug, e.g. "teacher") rides along as a
    third httpOnly cookie, same lifetime as the REFRESH token. It is NOT a
    security boundary — the backend's own RBAC checks (HasModulePermission
    etc.) are what actually authorize every request, unchanged by this. It
    exists solely so `proxy.ts` can redirect a signed-in user away from a
    portal that isn't theirs (e.g. a student hitting /teacher) without
    decoding/verifying the JWT — same "presence-only" spirit as the existing
    access/refresh cookie check, just extended to "which portal" instead of
    just "signed in or not".

    It must outlive the access token: `proxy.ts` treats "refresh cookie
    present" as signed in, so a role cookie that expired after 15 minutes
    left a 30-day session with no portal hint, and the proxy used to fall
    through to the Admin portal (`/`) for every role — including logged-out
    visitors carrying a stale refresh cookie.
    """

    common = {
        "httponly": True,
        "samesite": "Lax",
        "secure": not settings.DEBUG,
        "path": "/",
    }
    access_max_age = int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())
    response.set_cookie(ACCESS_COOKIE, access, max_age=access_max_age, **common)
    refresh_max_age = int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())
    response.set_cookie(REFRESH_COOKIE, refresh, max_age=refresh_max_age, **common)
    if role:
        response.set_cookie(ROLE_COOKIE, role, max_age=refresh_max_age, **common)


def clear_auth_cookies(response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path="/", samesite="Lax")
    response.delete_cookie(REFRESH_COOKIE, path="/", samesite="Lax")
    response.delete_cookie(ROLE_COOKIE, path="/", samesite="Lax")
