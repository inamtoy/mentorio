from django.urls import path

from grades.views import StudentGradeSummaryView, TeacherGradeSummaryView

urlpatterns = [
    path("grades/teacher-summary/", TeacherGradeSummaryView.as_view(), name="teacher-grade-summary"),
    path("grades/student-summary/", StudentGradeSummaryView.as_view(), name="student-grade-summary"),
]
