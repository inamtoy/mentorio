"""API-level tests for TeacherGradeSummaryView/StudentGradeSummaryView —
computed, not stored (see either view's own docstring), so these exercise
the actual aggregation math, not just CRUD plumbing. Same fixture style as
attendance/tests/test_attendance_authorization.py: a real login is needed
since HasModulePermission + the teacher-owns-group/student-owns-enrollment
scoping both read from request.user, and role/permission grants only exist
once foundation.signals's post_save provisioning has actually run.
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
from foundation.models import Organization, Role, User, UserRole
from groups.models import Group, GroupMember
from homework.models import Assignment, Submission
from student.models import StudentProfile
from teacher.models import TeacherProfile

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"
URL = "/api/v1/grades/teacher-summary/"
STUDENT_URL = "/api/v1/grades/student-summary/"


def _make_org():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-grades-test-{uuid.uuid4().hex[:8]}", email="a@example.com"
        )


def _make_teacher_login(org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="T", last_name=phone[-4:], password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="teacher")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    profile = TeacherProfile.objects.using(BYPASS_ALIAS).create(organization=org, user=user, teacher_code=f"TCH-{phone[-4:]}")
    return user, profile


def _make_student_login(org, phone, first_name="S"):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name=first_name, last_name=phone[-4:], password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="student")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    profile = StudentProfile.objects.using(BYPASS_ALIAS).create(organization=org, user=user, student_code=f"STU-{phone[-4:]}")
    return user, profile


def _make_admin_login(org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="A", last_name=phone[-4:], password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="center_admin")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    return user


def _login(phone):
    client = APIClient()
    response = client.post("/api/v1/auth/login/", {"login_id": phone, "password": "pw123456"}, format="json")
    assert response.status_code == 200
    return client


def test_teacher_sees_correct_grade_math_for_own_group():
    """One group, two students: 'Full' has assignment + exam + attendance
    data (checks assignment_avg/exam_avg/final_grade/attendance_pct/trend
    all together); 'Partial' has only an exam score (checks final_grade
    falls back to the single available component instead of being dragged
    toward 0 by a phantom missing half, and that attendance_pct/trend are
    None rather than 0/'stable' when there's no data at all).
    """
    org = _make_org()
    course = Course.objects.using(BYPASS_ALIAS).create(organization=org, name="Course", code="CRS-G1", category="General")
    teacher_user, teacher = _make_teacher_login(org, "+998910000001")
    group = Group.objects.using(BYPASS_ALIAS).create(
        organization=org, course=course, teacher=teacher, code="GRP-G1", name="Group Full", start_date="2026-09-01"
    )

    _full_user, full = _make_student_login(org, "+998910000002", "Full")
    _partial_user, partial = _make_student_login(org, "+998910000003", "Partial")
    GroupMember.objects.using(BYPASS_ALIAS).create(organization=org, group=group, student_profile=full)
    GroupMember.objects.using(BYPASS_ALIAS).create(organization=org, group=group, student_profile=partial)

    now = timezone.now()

    # "Full": one graded assignment (80/100 = 80%), one graded exam
    # (70/100 = 70%) — assignment_avg=80, exam_avg=70, final_grade=75.
    # Exam graded more recently than the assignment, so the 2-event
    # timeline (newest first) is [exam 70%, assignment 80%] -> trend "down".
    assignment = Assignment.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group, title="A1", due_date="2026-09-05", max_score=100
    )
    Submission.objects.using(BYPASS_ALIAS).create(
        organization=org, assignment=assignment, student_profile=full, score=80, graded_at=now - timedelta(days=2)
    )
    exam = Exam.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group, title="E1", date="2026-09-10", start_time="09:00", max_score=100
    )
    ExamResult.objects.using(BYPASS_ALIAS).create(
        organization=org, exam=exam, student_profile=full, score=70, graded_at=now - timedelta(days=1)
    )
    # Attendance: 2 present, 1 absent -> 67%.
    for i, status in enumerate(["present", "present", "absent"]):
        Attendance.objects.using(BYPASS_ALIAS).create(
            organization=org, group=group, student_profile=full, date=f"2026-09-0{i + 1}", status=status
        )

    # "Partial": only a graded exam (50/100 = 50%), nothing else at all.
    exam2 = Exam.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group, title="E2", date="2026-09-11", start_time="09:00", max_score=100
    )
    ExamResult.objects.using(BYPASS_ALIAS).create(
        organization=org, exam=exam2, student_profile=partial, score=50, graded_at=now
    )

    client = _login(teacher_user.login_id)
    response = client.get(URL)
    assert response.status_code == 200
    rows = {row["student_name"]: row for row in response.json()["data"]}

    assert len(rows) == 2
    full_row = rows["Full 0002"]
    assert full_row["assignment_avg"] == 80
    assert full_row["exam_avg"] == 70
    assert full_row["final_grade"] == 75
    assert full_row["attendance_pct"] == 67
    assert full_row["trend"] == "down"

    partial_row = rows["Partial 0003"]
    assert partial_row["assignment_avg"] is None
    assert partial_row["exam_avg"] == 50
    assert partial_row["final_grade"] == 50  # not dragged toward 0 by the missing assignment half
    assert partial_row["attendance_pct"] is None
    assert partial_row["trend"] is None  # only 1 scored event ever


def test_teacher_cannot_see_another_teachers_group_grades():
    org = _make_org()
    course = Course.objects.using(BYPASS_ALIAS).create(organization=org, name="Course", code="CRS-G2", category="General")
    teacher_a_user, teacher_a = _make_teacher_login(org, "+998910000004")
    _teacher_b_user, teacher_b = _make_teacher_login(org, "+998910000005")

    group_a = Group.objects.using(BYPASS_ALIAS).create(
        organization=org, course=course, teacher=teacher_a, code="GRP-G2A", name="Group A", start_date="2026-09-01"
    )
    group_b = Group.objects.using(BYPASS_ALIAS).create(
        organization=org, course=course, teacher=teacher_b, code="GRP-G2B", name="Group B", start_date="2026-09-01"
    )
    _student_a_user, student_a = _make_student_login(org, "+998910000006", "InA")
    _student_b_user, student_b = _make_student_login(org, "+998910000007", "InB")
    GroupMember.objects.using(BYPASS_ALIAS).create(organization=org, group=group_a, student_profile=student_a)
    GroupMember.objects.using(BYPASS_ALIAS).create(organization=org, group=group_b, student_profile=student_b)

    client = _login(teacher_a_user.login_id)
    response = client.get(URL)
    assert response.status_code == 200
    names = [row["student_name"] for row in response.json()["data"]]
    assert "InA 0006" in names
    assert "InB 0007" not in names


def test_role_without_grades_permission_gets_403():
    """`grades:view` is granted to `teacher` and `student` only (see
    foundation/permissions_catalog.py's "grades" note) — `center_admin` has
    no grant for this module at all, on either endpoint.
    """
    org = _make_org()
    admin_user = _make_admin_login(org, "+998910000008")

    client = _login(admin_user.login_id)
    assert client.get(URL).status_code == 403
    assert client.get(STUDENT_URL).status_code == 403


def test_student_login_on_teacher_endpoint_gets_empty_not_403():
    """A student caller passes the module-wide grades:view check (shared by
    both endpoints — see TeacherGradeSummaryView's docstring) but has no
    teacher_profile, so TeacherGradeSummaryView's defensive branch returns
    an empty list rather than erroring — it's simply the wrong endpoint for
    that caller, not a permissions violation.
    """
    org = _make_org()
    student_user, _student = _make_student_login(org, "+998910000009")

    client = _login(student_user.login_id)
    response = client.get(URL)
    assert response.status_code == 200
    assert response.json()["data"] == []


def test_student_sees_correct_grade_math_for_own_enrollment():
    """Mirrors test_teacher_sees_correct_grade_math_for_own_group's fixture
    shape, from the student's own point of view — same aggregation core
    (_gather_events/_stats_for_key), different labels (subject/teacher_name
    instead of student_name) and different scoping (own enrollments, not
    groups taught).
    """
    org = _make_org()
    course = Course.objects.using(BYPASS_ALIAS).create(organization=org, name="Algebra", code="CRS-G3", category="General")
    _teacher_user, teacher = _make_teacher_login(org, "+998910000010")
    group = Group.objects.using(BYPASS_ALIAS).create(
        organization=org, course=course, teacher=teacher, code="GRP-G3", name="Algebra A1", start_date="2026-09-01"
    )
    student_user, student = _make_student_login(org, "+998910000011", "Me")
    GroupMember.objects.using(BYPASS_ALIAS).create(organization=org, group=group, student_profile=student)

    now = timezone.now()
    assignment = Assignment.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group, title="A1", due_date="2026-09-05", max_score=100
    )
    Submission.objects.using(BYPASS_ALIAS).create(
        organization=org, assignment=assignment, student_profile=student, score=60, graded_at=now - timedelta(days=1)
    )
    exam = Exam.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group, title="E1", date="2026-09-10", start_time="09:00", max_score=100
    )
    ExamResult.objects.using(BYPASS_ALIAS).create(
        organization=org, exam=exam, student_profile=student, score=80, graded_at=now
    )
    Attendance.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group, student_profile=student, date="2026-09-01", status="present"
    )

    client = _login(student_user.login_id)
    response = client.get(STUDENT_URL)
    assert response.status_code == 200
    rows = response.json()["data"]
    assert len(rows) == 1
    row = rows[0]
    assert row["subject"] == "Algebra"
    assert row["teacher_name"] == teacher.user.get_full_name()
    assert row["assignment_avg"] == 60
    assert row["exam_avg"] == 80
    assert row["final_grade"] == 70
    assert row["attendance_pct"] == 100
    assert row["trend"] == "up"  # exam (80%, more recent) > assignment (60%, older)


def test_student_does_not_see_groups_they_are_not_enrolled_in():
    org = _make_org()
    course = Course.objects.using(BYPASS_ALIAS).create(organization=org, name="Course", code="CRS-G4", category="General")
    _teacher_user, teacher = _make_teacher_login(org, "+998910000012")
    group_enrolled = Group.objects.using(BYPASS_ALIAS).create(
        organization=org, course=course, teacher=teacher, code="GRP-G4A", name="Enrolled", start_date="2026-09-01"
    )
    group_other = Group.objects.using(BYPASS_ALIAS).create(
        organization=org, course=course, teacher=teacher, code="GRP-G4B", name="Other", start_date="2026-09-01"
    )
    student_user, student = _make_student_login(org, "+998910000013")
    GroupMember.objects.using(BYPASS_ALIAS).create(organization=org, group=group_enrolled, student_profile=student)
    # No GroupMember for group_other — student was never enrolled in it.

    client = _login(student_user.login_id)
    response = client.get(STUDENT_URL)
    assert response.status_code == 200
    group_names = [row["group_name"] for row in response.json()["data"]]
    assert group_names == ["Enrolled"]
