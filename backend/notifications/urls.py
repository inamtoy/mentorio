from django.urls import path
from rest_framework.routers import DefaultRouter

from notifications.views import MyTelegramView, NotificationViewSet

router = DefaultRouter()
router.register("notifications", NotificationViewSet, basename="notification")

# Before the router's patterns: "notifications/telegram/" must not be read
# as a notification pk.
urlpatterns = [
    path("notifications/telegram/", MyTelegramView.as_view(), name="my-telegram"),
    *router.urls,
]
