"""Explicit audit-log writes for the four CLAUDE.md-mandated categories
(auth, payment, role-change, deletion) — deliberately not generic
post_save/post_delete signals on every model. See plan §5 for why: login/
logout aren't model saves at all; soft-delete is itself a .save() so a naive
signal can't distinguish it from an ordinary field update; and blanket
per-model logging would log far more than CLAUDE.md actually asks for.
"""

from __future__ import annotations

import ipaddress
from functools import wraps

from django.conf import settings

from common.context import get_current_org_id


def get_client_ip(request) -> str | None:
    """The real client address, for login lockout, sessions and audit logs.

    Behind nginx, REMOTE_ADDR is always the proxy (127.0.0.1), so every
    visitor looked like the same one — which turned the per-(login_id, IP)
    login lockout into a per-login_id one anyone could trigger. The proxy's
    X-Real-IP header is honored only when the request really came from a
    trusted proxy (settings.TRUSTED_PROXY_IPS), and is never read from a
    client directly. X-Forwarded-For's first entry is deliberately NOT
    used: nginx appends to whatever the client sent, so that entry is
    attacker-controlled.
    """
    remote_addr = request.META.get("REMOTE_ADDR")
    if remote_addr in getattr(settings, "TRUSTED_PROXY_IPS", ()):
        real_ip = (request.META.get("HTTP_X_REAL_IP") or "").strip()
        try:
            return str(ipaddress.ip_address(real_ip))
        except ValueError:
            pass
    return remote_addr


def audit_log(
    request,
    *,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    old_values: dict | None = None,
    new_values: dict | None = None,
    metadata: dict | None = None,
    user=None,
    using: str | None = None,
) -> None:
    """`user` only needs overriding for login itself — at that point in the
    request `request.user` is still AnonymousUser (auth hasn't happened
    yet), so the view passes the just-authenticated user explicitly.
    `using`, likewise, only matters for login: that request never went
    through OrganizationContextMiddleware (no token existed yet to decode),
    so the regular connection has no org context and this row would be
    blocked by RLS unless written through the same BYPASSRLS alias the rest
    of the login flow uses.
    """
    from foundation.models import AuditLog

    if user is None:
        request_user = getattr(request, "user", None)
        user = request_user if request_user is not None and request_user.is_authenticated else None

    manager = AuditLog.objects.using(using) if using else AuditLog.objects
    manager.create(
        organization_id=get_current_org_id() or getattr(user, "organization_id", None),
        user=user,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_values=old_values,
        new_values=new_values,
        ip_address=get_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
        metadata=metadata or {},
    )


def audited(action: str, entity_type: str, entity_id_getter=None):
    """Decorator for DRF viewset action methods: `def destroy(self, request, *a, **kw)`.

    Only logs on a successful (2xx) response — a failed create/delete never
    happened, so it shouldn't appear in the trail. `entity_id_getter`, if
    given, receives (response, kwargs) and returns the entity id string;
    default falls back to the URL's `pk` kwarg.
    """

    def decorator(view_method):
        @wraps(view_method)
        def wrapper(self, request, *args, **kwargs):
            response = view_method(self, request, *args, **kwargs)
            if 200 <= response.status_code < 300:
                entity_id = (
                    entity_id_getter(response, kwargs)
                    if entity_id_getter
                    else kwargs.get("pk")
                )
                audit_log(request, action=action, entity_type=entity_type, entity_id=entity_id)
            return response

        return wrapper

    return decorator
