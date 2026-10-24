from django.urls import path
from rest_framework.routers import DefaultRouter

from homework.views import (
    AssignmentViewSet,
    HomeworkAttachmentDownloadView,
    HomeworkAttachmentUploadView,
    SubmissionViewSet,
)

router = DefaultRouter()
router.register("homework/submissions", SubmissionViewSet, basename="submission")
router.register("homework/assignments", AssignmentViewSet, basename="assignment")

urlpatterns = [
    path("homework/attachments/", HomeworkAttachmentUploadView.as_view(), name="homework-attachment-upload"),
    path(
        "homework/attachments/<uuid:file_id>/download/",
        HomeworkAttachmentDownloadView.as_view(),
        name="homework-attachment-download",
    ),
    *router.urls,
]
