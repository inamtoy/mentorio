from django.urls import path

from auth_custom.views import (
    LoginView,
    LogoutView,
    PasswordResetConfirmView,
    PasswordResetStartView,
    RefreshView,
    SessionListView,
    SessionRevokeView,
    TelegramWebhookView,
)

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("sessions/", SessionListView.as_view(), name="session-list"),
    path("sessions/<uuid:session_id>/revoke/", SessionRevokeView.as_view(), name="session-revoke"),
    path("password-reset/start/", PasswordResetStartView.as_view(), name="password-reset-start"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
    path("telegram/webhook/", TelegramWebhookView.as_view(), name="telegram-webhook"),
]
