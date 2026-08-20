"""Root URL configuration.

No django.contrib.admin — the Super-Admin frontend portal + this DRF API is
the real admin surface for Phase 0 (see plan decision 9): the schema has no
is_staff/is_superuser for Django admin's auth to hook into anyway.
"""

from django.urls import include, path

urlpatterns = [
    path("api/v1/", include("foundation.urls")),
    path("api/v1/auth/", include("auth_custom.urls")),
    path("api/v1/", include("student.urls")),
    path("api/v1/", include("teacher.urls")),
    path("api/v1/", include("course.urls")),
    path("api/v1/", include("groups.urls")),
    path("api/v1/", include("attendance.urls")),
    path("api/v1/", include("finance.urls")),
    path("api/v1/", include("notifications.urls")),
    path("api/v1/", include("schedule.urls")),
    path("api/v1/", include("homework.urls")),
    path("api/v1/", include("payment_gateways.urls")),
    path("api/v1/", include("billing.urls")),
    path("api/v1/", include("exams.urls")),
    path("api/v1/", include("grades.urls")),
]

# JSON-envelope fallback for unhandled exceptions — see common/exceptions.py.
handler500 = "common.exceptions.json_500_handler"
