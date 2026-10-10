"""API-level tests for the four reports/ views — computed, not stored (see
reports/views.py's module docstring), so these exercise the actual
aggregation math, not just CRUD plumbing. Same fixture style as
grades/tests/test_grades.py: a real login is needed since HasModulePermission
reads from request.user, and role/permission grants only exist once
foundation.signals's post_save provisioning has actually run.

Invoice.issued_date/Payment.payment_date are both server-set
(`default=timezone.localdate, editable=False`), so every invoice/payment
created here lands "today", which is why the views' default period
(1st-of-month through today) is left unset on every request rather than
passed explicitly. "Today" here must be the same `timezone.localdate()` the
views use — these tests used to fail between 00:00 and 05:00 Tashkent time
on Windows dev machines, when those fields were stamped by
`datetime.date.today()` (the OS clock) instead.
"""

import uuid
from datetime import timedelta

import pytest
from django.db import transaction as db_transaction
from django.utils import timezone
from rest_framework.test import APIClient

from attendance.models import Attendance
from common.context import apply_org_context
from course.models import Course
from exams.models import Exam, ExamResult
from finance.models import Expense, Invoice, Payment, Payroll
from foundation.models import Organization, Role, User, UserRole
from groups.models import Group, GroupMember
from homework.models import Assignment, Submission
from schedule.models import Lesson
from student.models import StudentProfile
from teacher.models import TeacherProfile

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"
STUDENTS_URL = "/api/v1/reports/students-summary/"
TEACHERS_URL = "/api/v1/reports/teachers-summary/"
ATTENDANCE_URL = "/api/v1/reports/attendance-summary/"
FINANCE_URL = "/api/v1/reports/finance-summary/"


def _make_org():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-reports-test-{uuid.uuid4().hex[:8]}", email="a@example.com"
        )


def _make_teacher_login(org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="T", last_name=phone[-4:], password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="teacher")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    profile = TeacherProfile.objects.using(BYPASS_ALIAS).create(
        organization=org, user=user, teacher_code=f"TCH-{phone[-4:]}", status="active"
    )
    return user, profile


def _make_student_login(org, phone, first_name="S"):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name=first_name, last_name=phone[-4:], password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="student")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    profile = StudentProfile.objects.using(BYPASS_ALIAS).create(
        organization=org, user=user, student_code=f"STU-{phone[-4:]}", status="active"
    )
    return user, profile


def _make_admin_login(org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="A", last_name=phone[-4:], password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="center_admin")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    return user


def _login(login_id):
    client = APIClient()
    response = client.post("/api/v1/auth/login/", {"login_id": login_id, "password": "pw123456"}, format="json")
    assert response.status_code == 200
    return client


def test_role_without_reports_permission_gets_403():
    """`reports:view` is center_admin-only (see permissions_catalog.py's
    "reports" note) — a teacher/student caller is rejected on all four
    endpoints, not just quietly handed empty data the way grades handles a
    mismatched role.
    """
    org = _make_org()
    teacher_user, _teacher = _make_teacher_login(org, "+998920000001")
    student_user, _student = _make_student_login(org, "+998920000002")

    for login_id in (teacher_user.login_id, student_user.login_id):
        client = _login(login_id)
        assert client.get(STUDENTS_URL).status_code == 403
        assert client.get(TEACHERS_URL).status_code == 403
        assert client.get(ATTENDANCE_URL).status_code == 403
        assert client.get(FINANCE_URL).status_code == 403


def test_students_summary_rolls_up_across_all_of_a_students_groups():
    """One student enrolled in two groups: attendance/homework/grades from
    BOTH groups combine into one row — unlike grades/views.py's per-group
    breakdown, this is an org-level "how is this student doing overall"
    report (see StudentsSummaryReportView's docstring).
    """
    org = _make_org()
    course = Course.objects.using(BYPASS_ALIAS).create(organization=org, name="Course", code="CRS-R1", category="General")
    _teacher_user, teacher = _make_teacher_login(org, "+998920000003")
    group_a = Group.objects.using(BYPASS_ALIAS).create(
        organization=org, course=course, teacher=teacher, code="GRP-R1A", name="A", start_date="2026-08-01"
    )
    group_b = Group.objects.using(BYPASS_ALIAS).create(
        organization=org, course=course, teacher=teacher, code="GRP-R1B", name="B", start_date="2026-08-01"
    )
    student_user, student = _make_student_login(org, "+998920000004", "Combo")
    GroupMember.objects.using(BYPASS_ALIAS).create(organization=org, group=group_a, student_profile=student)
    GroupMember.objects.using(BYPASS_ALIAS).create(organization=org, group=group_b, student_profile=student)

    today = timezone.localdate()
    now = timezone.now()

    # Group A: one graded assignment (80/100), one present + one absent.
    assignment_a = Assignment.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group_a, title="A1", due_date=today, max_score=100
    )
    Submission.objects.using(BYPASS_ALIAS).create(
        organization=org, assignment=assignment_a, student_profile=student, score=80, graded_at=now
    )
    Attendance.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group_a, student_profile=student, date=today, status="present"
    )
    Attendance.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group_a, student_profile=student, date=today - timedelta(days=1), status="absent"
    )

    # Group B: one graded exam (60/100), one present.
    exam_b = Exam.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group_b, title="E1", date=today, start_time="09:00", max_score=100
    )
    ExamResult.objects.using(BYPASS_ALIAS).create(
        organization=org, exam=exam_b, student_profile=student, score=60, graded_at=now
    )
    Attendance.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group_b, student_profile=student, date=today, status="present"
    )

    admin_user = _make_admin_login(org, "+998920000005")
    client = _login(admin_user.login_id)
    response = client.get(STUDENTS_URL)
    assert response.status_code == 200
    rows = {row["student_name"]: row for row in response.json()["data"]}
    row = rows["Combo 0004"]

    # attendance: 2 present out of 3 total, across both groups -> 67%.
    assert row["attendance_rate"] == 67
    assert row["lessons_attended"] == 2
    assert row["lessons_total"] == 3
    # homework: 1 assignment total (only group_a has one), 1 submitted -> 100%.
    assert row["homeworks_total"] == 1
    assert row["homeworks_submitted"] == 1
    assert row["homework_completion_rate"] == 100
    assert row["exam_average"] == 60
    # average_grade = mean(assignment_avg=80, exam_avg=60) = 70, same rule as grades.final_grade.
    assert row["average_grade"] == 70


def test_teachers_summary_counts_lessons_and_workload():
    org = _make_org()
    course = Course.objects.using(BYPASS_ALIAS).create(organization=org, name="Course", code="CRS-R2", category="General")
    teacher_user, teacher = _make_teacher_login(org, "+998920000006")
    group = Group.objects.using(BYPASS_ALIAS).create(
        organization=org, course=course, teacher=teacher, code="GRP-R2", name="G", start_date="2026-08-01", status="active"
    )
    _student_user, student = _make_student_login(org, "+998920000007")
    GroupMember.objects.using(BYPASS_ALIAS).create(organization=org, group=group, student_profile=student)

    today = timezone.localdate()
    Lesson.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group, date=today, start_time="09:00", end_time="10:00", status="completed"
    )
    Lesson.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group, date=today - timedelta(days=1), start_time="09:00", end_time="10:00", status="cancelled"
    )
    Lesson.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group, date=today - timedelta(days=2), start_time="09:00", end_time="10:00", status="scheduled"
    )

    admin_user = _make_admin_login(org, "+998920000008")
    client = _login(admin_user.login_id)
    response = client.get(TEACHERS_URL)
    assert response.status_code == 200
    rows = {row["teacher_name"]: row for row in response.json()["data"]}
    row = rows[teacher_user.get_full_name()]

    assert row["groups_count"] == 1
    assert row["total_students"] == 1
    assert row["lessons_taught"] == 1
    assert row["lessons_cancelled"] == 1


def test_attendance_summary_flags_at_risk_students():
    org = _make_org()
    course = Course.objects.using(BYPASS_ALIAS).create(organization=org, name="Course", code="CRS-R3", category="General")
    _teacher_user, teacher = _make_teacher_login(org, "+998920000009")
    group = Group.objects.using(BYPASS_ALIAS).create(
        organization=org, course=course, teacher=teacher, code="GRP-R3", name="G", start_date="2026-08-01"
    )
    ok_user, ok_student = _make_student_login(org, "+998920000010", "OkStudent")
    risky_user, risky_student = _make_student_login(org, "+998920000011", "RiskyStudent")
    GroupMember.objects.using(BYPASS_ALIAS).create(organization=org, group=group, student_profile=ok_student)
    GroupMember.objects.using(BYPASS_ALIAS).create(organization=org, group=group, student_profile=risky_student)

    today = timezone.localdate()
    # OkStudent: 2 present, 0 absent -> 100%.
    for i in range(2):
        Attendance.objects.using(BYPASS_ALIAS).create(
            organization=org, group=group, student_profile=ok_student, date=today - timedelta(days=i), status="present"
        )
    # RiskyStudent: 1 present, 3 absent -> 25%, below the 70% threshold.
    Attendance.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group, student_profile=risky_student, date=today, status="present"
    )
    for i in range(1, 4):
        Attendance.objects.using(BYPASS_ALIAS).create(
            organization=org, group=group, student_profile=risky_student, date=today - timedelta(days=i), status="absent"
        )

    admin_user = _make_admin_login(org, "+998920000012")
    client = _login(admin_user.login_id)
    response = client.get(ATTENDANCE_URL)
    assert response.status_code == 200
    data = response.json()["data"]

    assert data["total_students"] == 2
    assert data["present_count"] == 3
    assert data["absent_count"] == 3
    at_risk_names = [row["student_name"] for row in data["at_risk_students"]]
    assert at_risk_names == ["RiskyStudent 0011"]


def test_finance_summary_computes_outstanding_and_overdue():
    org = _make_org()
    _student_user, student = _make_student_login(org, "+998920000013")
    today = timezone.localdate()

    # Fully paid invoice -> not outstanding.
    paid_invoice = Invoice.objects.using(BYPASS_ALIAS).create(
        organization=org, student_profile=student, invoice_number="INV-1", total_amount="100000.00", due_date=today + timedelta(days=10)
    )
    Payment.objects.using(BYPASS_ALIAS).create(
        organization=org, invoice=paid_invoice, student_profile=student, amount="100000.00"
    )

    # Partially paid, due in the future -> outstanding but not overdue.
    open_invoice = Invoice.objects.using(BYPASS_ALIAS).create(
        organization=org, student_profile=student, invoice_number="INV-2", total_amount="200000.00", due_date=today + timedelta(days=10)
    )
    Payment.objects.using(BYPASS_ALIAS).create(
        organization=org, invoice=open_invoice, student_profile=student, amount="50000.00"
    )

    # Unpaid, due in the past -> outstanding AND overdue.
    overdue_invoice = Invoice.objects.using(BYPASS_ALIAS).create(
        organization=org, student_profile=student, invoice_number="INV-3", total_amount="75000.00",
        due_date=today - timedelta(days=5), status="overdue",
    )

    admin_user = _make_admin_login(org, "+998920000014")
    client = _login(admin_user.login_id)
    response = client.get(FINANCE_URL)
    assert response.status_code == 200
    data = response.json()["data"]

    assert data["total_invoiced"] == 375000.0
    assert data["total_collected"] == 150000.0
    assert data["total_outstanding"] == 225000.0  # (200000-50000) + 75000
    assert data["total_overdue"] == 75000.0
    assert data["new_enrollments"] == 1
    # No expense/payroll rows at all -> zeros, and net profit is just revenue.
    assert data["total_expenses"] == 0.0
    assert data["payroll_total"] == 0.0
    assert data["net_profit"] == 150000.0


def _make_expense(org, title, amount, **kwargs):
    return Expense.objects.using(BYPASS_ALIAS).create(
        organization=org, category="rent", title=title, amount=amount, **kwargs
    )


def _make_payroll(org, teacher, period_start, period_end, **kwargs):
    return Payroll.objects.using(BYPASS_ALIAS).create(
        organization=org, teacher_profile=teacher, period_start=period_start, period_end=period_end, **kwargs
    )


def test_finance_summary_counts_only_paid_expenses_and_payroll_in_period():
    """Cash-basis (see FinanceSummaryReportView's docstring): only
    `status="paid"` rows whose `paid_at` falls inside the period count —
    not pending/approved/rejected expenses, not draft/approved/cancelled
    payroll, not soft-deleted rows, not rows paid before the period.
    """
    org = _make_org()
    _student_user, student = _make_student_login(org, "+998920000015")
    _teacher_user, teacher = _make_teacher_login(org, "+998920000016")
    now = timezone.now()
    before_period = now - timedelta(days=timezone.localdate().day)  # last day of the previous month

    invoice = Invoice.objects.using(BYPASS_ALIAS).create(
        organization=org, student_profile=student, invoice_number="INV-E1", total_amount="1000000.00",
        due_date=timezone.localdate() + timedelta(days=10),
    )
    Payment.objects.using(BYPASS_ALIAS).create(
        organization=org, invoice=invoice, student_profile=student, amount="1000000.00"
    )

    # Expenses: only the first one counts.
    _make_expense(org, "Counted", "300000.00", status="paid", paid_at=now)
    _make_expense(org, "Pending", "1.00", status="pending")
    _make_expense(org, "Approved", "2.00", status="approved")
    _make_expense(org, "Rejected", "4.00", status="rejected")
    _make_expense(org, "Deleted", "8.00", status="paid", paid_at=now, deleted_at=now)
    _make_expense(org, "Last month", "16.00", status="paid", paid_at=before_period)

    # Payroll: only the first one counts, at its NET amount
    # (200000 + 50000 bonus - 10000 deductions - 40000 tax = 200000).
    _make_payroll(
        org, teacher, "2026-01-01", "2026-01-31", base_salary="200000.00", bonus="50000.00",
        deductions="10000.00", tax_amount="40000.00", status="paid", paid_at=now,
    )
    _make_payroll(org, teacher, "2026-02-01", "2026-02-28", base_salary="1.00", status="draft")
    _make_payroll(org, teacher, "2026-03-01", "2026-03-31", base_salary="2.00", status="approved")
    _make_payroll(org, teacher, "2026-04-01", "2026-04-30", base_salary="4.00", status="cancelled")
    _make_payroll(
        org, teacher, "2026-05-01", "2026-05-31", base_salary="8.00", status="paid", paid_at=now, deleted_at=now
    )
    _make_payroll(org, teacher, "2026-06-01", "2026-06-30", base_salary="16.00", status="paid", paid_at=before_period)

    admin_user = _make_admin_login(org, "+998920000017")
    client = _login(admin_user.login_id)
    data = client.get(FINANCE_URL).json()["data"]

    assert data["total_collected"] == 1000000.0
    assert data["total_expenses"] == 300000.0
    assert data["payroll_total"] == 200000.0
    assert data["net_profit"] == 500000.0  # 1000000 - 300000 - 200000

    # The row paid last month shows up once the window includes that date.
    day = before_period.date().isoformat()
    data = client.get(FINANCE_URL, {"start": day, "end": day}).json()["data"]
    assert data["total_expenses"] == 16.0
    assert data["payroll_total"] == 16.0
    assert data["net_profit"] == -32.0


def test_finance_summary_expenses_and_payroll_are_org_isolated():
    """Another org's paid expenses/payroll never leak into this org's
    report — scoped by RLS like every other query in this module."""
    org = _make_org()
    other_org = _make_org()
    _other_teacher_user, other_teacher = _make_teacher_login(other_org, "+998920000018")
    now = timezone.now()
    _make_expense(other_org, "Other org rent", "500000.00", status="paid", paid_at=now)
    _make_payroll(
        other_org, other_teacher, "2026-01-01", "2026-01-31", base_salary="700000.00", status="paid", paid_at=now
    )
    _make_expense(org, "Own rent", "100000.00", status="paid", paid_at=now)

    admin_user = _make_admin_login(org, "+998920000019")
    client = _login(admin_user.login_id)
    data = client.get(FINANCE_URL).json()["data"]

    assert data["total_expenses"] == 100000.0
    assert data["payroll_total"] == 0.0
    assert data["net_profit"] == -100000.0
