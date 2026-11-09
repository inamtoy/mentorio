"""Model-level tests plus API-level tests for the teacher-owns-group check
in LessonViewSet — same pattern as
attendance/tests/test_attendance_authorization.py.

Fixture setup goes through the auth_bypass_rls alias throughout — see
finance/tests/test_finance.py's module docstring for why, under
`transaction=True`, this is what's needed.
"""

import uuid

import pytest
from django.db import IntegrityError
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from common.context import apply_org_context
from course.models import Course
from foundation.models import Organization, Role, User, UserRole
from groups.models import Group
from schedule.models import Lesson
from teacher.models import TeacherProfile

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _make_org():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-schedule-test-{uuid.uuid4().hex[:8]}", email="a@example.com"
        )


def _make_teacher_login(org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="T", last_name=phone[-4:], password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="teacher")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    profile = TeacherProfile.objects.using(BYPASS_ALIAS).create(organization=org, user=user, teacher_code=f"TCH-{phone[-9:]}")
    return user, profile


def _make_group(org, teacher, code):
    course = Course.objects.using(BYPASS_ALIAS).create(organization=org, name="Course", code=f"CRS-{code}", category="General")
    return Group.objects.using(BYPASS_ALIAS).create(
        organization=org, course=course, teacher=teacher, code=code, name=code, start_date="2026-09-01"
    )


def test_teacher_cannot_schedule_lesson_for_another_teachers_group():
    org = _make_org()
    _teacher_a_user, teacher_a = _make_teacher_login(org, "+998900200001")
    teacher_b_user, _teacher_b = _make_teacher_login(org, "+998900200002")
    group_a = _make_group(org, teacher_a, "GRP-A")

    client = APIClient()
    login = client.post("/api/v1/auth/login/", {"login_id": teacher_b_user.login_id, "password": "pw123456"}, format="json")
    assert login.status_code == 200

    response = client.post(
        "/api/v1/schedule/lessons/",
        {
            "organization": str(org.id), "group": str(group_a.id), "date": "2026-09-07",
            "start_time": "09:00", "end_time": "10:30",
        },
        format="json",
    )
    assert response.status_code == 403


def test_teacher_can_schedule_lesson_for_own_group():
    org = _make_org()
    teacher_a_user, teacher_a = _make_teacher_login(org, "+998900200003")
    group_a = _make_group(org, teacher_a, "GRP-B")

    client = APIClient()
    login = client.post("/api/v1/auth/login/", {"login_id": teacher_a_user.login_id, "password": "pw123456"}, format="json")
    assert login.status_code == 200

    response = client.post(
        "/api/v1/schedule/lessons/",
        {
            "organization": str(org.id), "group": str(group_a.id), "date": "2026-09-07",
            "start_time": "09:00", "end_time": "10:30", "topic": "Intro",
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["data"]["created_by"] == str(teacher_a_user.id)


def test_end_time_before_start_time_is_rejected():
    org = _make_org()
    _teacher_user, teacher = _make_teacher_login(org, "+998900200004")
    group = _make_group(org, teacher, "GRP-C")

    with pytest.raises(IntegrityError):
        Lesson.objects.using(BYPASS_ALIAS).create(
            organization=org, group=group, date="2026-09-07", start_time="10:30", end_time="09:00",
        )


def test_soft_delete_never_hard_deletes():
    org = _make_org()
    _teacher_user, teacher = _make_teacher_login(org, "+998900200005")
    group = _make_group(org, teacher, "GRP-D")
    lesson = Lesson.objects.using(BYPASS_ALIAS).create(
        organization=org, group=group, date="2026-09-07", start_time="09:00", end_time="10:30",
    )
    lesson_id = lesson.id

    lesson.delete(using=BYPASS_ALIAS)

    assert not Lesson.objects.using(BYPASS_ALIAS).filter(id=lesson_id).exists()
    assert Lesson.all_objects.using(BYPASS_ALIAS).filter(id=lesson_id).exists()
    assert Lesson.all_objects.using(BYPASS_ALIAS).get(id=lesson_id).deleted_at is not None
