from django.urls import path
from rest_framework.routers import DefaultRouter

from foundation.views import (
    ApiKeyViewSet,
    AuditLogViewSet,
    BranchViewSet,
    EmailTestView,
    MyRegionSettingsView,
    OrganizationViewSet,
    PermissionViewSet,
    PlatformBackupDownloadView,
    PlatformBackupListView,
    PlatformBrandingView,
    PlatformSettingsView,
    RoleViewSet,
    SmsTestView,
    UserViewSet,
)

router = DefaultRouter()
router.register("organizations", OrganizationViewSet, basename="organization")
router.register("branches", BranchViewSet, basename="branch")
router.register("users", UserViewSet, basename="user")
router.register("roles", RoleViewSet, basename="role")
router.register("permissions", PermissionViewSet, basename="permission")
router.register("audit-logs", AuditLogViewSet, basename="audit-log")
router.register("settings/api-keys", ApiKeyViewSet, basename="api-key")

urlpatterns = router.urls + [
    path("settings/platform/", PlatformSettingsView.as_view(), name="platform-settings"),
    path("settings/platform/branding/", PlatformBrandingView.as_view(), name="platform-branding"),
    path("settings/platform/email/test/", EmailTestView.as_view(), name="platform-email-test"),
    path("settings/platform/sms/test/", SmsTestView.as_view(), name="platform-sms-test"),
    path("settings/backups/", PlatformBackupListView.as_view(), name="platform-backups"),
    path("settings/backups/<uuid:backup_id>/download/", PlatformBackupDownloadView.as_view(), name="platform-backup-download"),
    path("settings/my-region/", MyRegionSettingsView.as_view(), name="my-region-settings"),
]
