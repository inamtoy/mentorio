from django.urls import path

from reports.views import (
    AttendanceSummaryReportView,
    FinanceSummaryReportView,
    StudentsSummaryReportView,
    TeachersSummaryReportView,
)

urlpatterns = [
    path("reports/students-summary/", StudentsSummaryReportView.as_view(), name="reports-students-summary"),
    path("reports/teachers-summary/", TeachersSummaryReportView.as_view(), name="reports-teachers-summary"),
    path("reports/attendance-summary/", AttendanceSummaryReportView.as_view(), name="reports-attendance-summary"),
    path("reports/finance-summary/", FinanceSummaryReportView.as_view(), name="reports-finance-summary"),
]
