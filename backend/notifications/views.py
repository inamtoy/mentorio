from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from auth_custom.models import TelegramAccount
from auth_custom.services import telegram_client
from auth_custom.services.telegram_bot import CONNECT_PARAM
from notifications.services.telegram_links import user_link_is_current

from common.audit import audited
from common.permissions import HasModulePermission
from foundation.views import SoftDeleteDestroyMixin
from notifications.filters import NotificationFilter
from notifications.models import Notification
from notifications.serializers import NotificationSerializer

NOTIFICATION_PERMISSION_MAP = {
    "list": ("notifications", "view"),
    "retrieve": ("notifications", "view"),
    "create": ("notifications", "create"),
    "update": ("notifications", "update"),
    "partial_update": ("notifications", "update"),
    "destroy": ("notifications", "delete"),
}


class NotificationViewSet(SoftDeleteDestroyMixin, viewsets.ModelViewSet):
    """Always scoped to the caller's own inbox — there is no oversight mode
    here (unlike e.g. StudentProfileViewSet, which any `students:view`
    holder can browse in full). A notification only matters to the person it
    was sent to, and nothing in the mock UI this replaces ever showed
    someone else's notifications, so `get_queryset` filters to
    `recipient=request.user` for every action, not just list — that also
    means reaching for another user's notification 404s instead of 403ing,
    which leaks less (no confirmation the row even exists).
    """

    serializer_class = NotificationSerializer
    permission_classes = [HasModulePermission]
    filterset_class = NotificationFilter
    entity_type = "notification"
    permission_map = NOTIFICATION_PERMISSION_MAP

    def get_queryset(self):
        return (
            Notification.objects.all()
            .filter(recipient=self.request.user)
            .select_related("sender")
            .order_by("-created_at")
        )

    def perform_create(self, serializer):
        serializer.save(organization=self.request.user.organization, sender=self.request.user)

    @audited(action="delete", entity_type="notification")
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


class MyTelegramView(APIView):
    """The caller's own Telegram link for notifications — Settings ->
    Notifications on every portal. Self-service, so IsAuthenticated only
    (same trust level as MyRegionSettingsView).

    Connecting happens in the bot, not here: the user opens `bot_url` and
    shares their contact, which proves the number (see
    notifications.services.telegram_links). This endpoint only reports the
    link and toggles it.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(self._payload(self._account(request)))

    def patch(self, request):
        enabled = request.data.get("notifications_enabled") if isinstance(request.data, dict) else None
        if not isinstance(enabled, bool):
            raise ValidationError({"notifications_enabled": ["Must be true or false."]})
        account = self._account(request)
        if account is None:
            raise ValidationError(
                {"notifications_enabled": ["Telegram is not connected yet. Open the bot and share your number first."]}
            )
        account.notifications_enabled = enabled
        account.save(update_fields=["notifications_enabled"])
        return Response(
            {
                "success": True,
                "message": "Telegram notifications turned on." if enabled else "Telegram notifications turned off.",
                "data": self._payload(account),
            }
        )

    @staticmethod
    def _account(request):
        """None also when the linked number is no longer the one on the
        profile (an admin changed it): that chat must not be shown as
        connected or re-enabled from here."""
        account = TelegramAccount.objects.filter(user=request.user).select_related("user").first()
        return account if account is not None and user_link_is_current(account) else None

    @staticmethod
    def _payload(account):
        return {
            "connected": account is not None,
            "username": account.username if account else None,
            "notifications_enabled": bool(account and account.notifications_enabled),
            "bot_url": telegram_client.deep_link(CONNECT_PARAM) if telegram_client.is_configured() else None,
        }
