from django.urls import path

from grades.views import TeacherGradeSummaryView

urlpatterns = [
    path("grades/teacher-summary/", TeacherGradeSummaryView.as_view(), name="teacher-grade-summary"),
]
