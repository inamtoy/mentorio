"""Double-booking checks in LessonSerializer (schedule/conflicts.py): the
same room, group or teacher can't hold two overlapping live lessons.

Fixture setup goes through the auth_bypass_rls alias, same as
test_schedule.py; requests go through the API as a center admin.
"""

import pytest
from rest_framework.test import APIClient

from foundation.models import Role, User, UserRole
from schedule.models import Lesson
from schedule.tests.test_schedule import BYPASS_ALIAS, _make_group, _make_org, _make_teacher_login

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

DATE = "2026-10-14"


def _admin_client(org, phone):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="A", last_name="Admin", password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug="center_admin")
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    client = APIClient()
    assert client.post("/api/v1/auth/login/", {"login_id": user.login_id, "password": "pw123456"}, format="json").status_code == 200
    return client


def _setup(phone_suffix):
    """An org with two teachers and three groups: g1 and g2 taught by teacher
    A, g3 by teacher B."""
    org = _make_org()
    _ua, teacher_a = _make_teacher_login(org, f"+99890031{phone_suffix}1")
    _ub, teacher_b = _make_teacher_login(org, f"+99890031{phone_suffix}2")
    groups = (
        _make_group(org, teacher_a, f"G1-{phone_suffix}"),
        _make_group(org, teacher_a, f"G2-{phone_suffix}"),
        _make_group(org, teacher_b, f"G3-{phone_suffix}"),
    )
    return org, groups, _admin_client(org, f"+99890031{phone_suffix}9")


def _post(client, org, group, start, end, room=None, **extra):
    body = {"organization": str(org.id), "group": str(group.id), "date": DATE, "start_time": start, "end_time": end}
    if room is not None:
        body["room"] = room
    body.update(extra)
    return client.post("/api/v1/schedule/lessons/", body, format="json")


def test_same_room_same_time_is_rejected_with_details():
    org, (g1, _g2, g3), client = _setup("01")
    assert _post(client, org, g1, "12:00", "13:30", room="Room A").status_code == 201

    response = _post(client, org, g3, "12:30", "14:00", room="  room a ")

    assert response.status_code == 400
    data = response.json()["data"]
    assert "room" in data
    assert data["conflict"]["type"] == "room"
    assert data["conflict"]["group_name"] == g1.name
    assert data["conflict"]["start_time"] == "12:00"
    assert data["conflict"]["end_time"] == "13:30"
    assert Lesson.objects.using(BYPASS_ALIAS).filter(group=g3).count() == 0


def test_different_rooms_and_teachers_at_the_same_time_are_allowed():
    org, (g1, _g2, g3), client = _setup("02")
    assert _post(client, org, g1, "12:00", "13:30", room="Room A").status_code == 201
    assert _post(client, org, g3, "12:00", "13:30", room="Room B").status_code == 201


def test_same_teacher_at_the_same_time_is_rejected_even_in_another_room():
    org, (g1, g2, _g3), client = _setup("03")
    assert _post(client, org, g1, "12:00", "13:30", room="Room A").status_code == 201

    response = _post(client, org, g2, "13:00", "14:00", room="Room B")

    assert response.status_code == 400
    data = response.json()["data"]
    assert "start_time" in data
    assert data["conflict"]["type"] == "teacher"
    assert data["conflict"]["group_name"] == g1.name


def test_same_group_twice_at_overlapping_times_is_rejected():
    org, (g1, _g2, _g3), client = _setup("04")
    assert _post(client, org, g1, "12:00", "13:30").status_code == 201

    response = _post(client, org, g1, "13:00", "14:00")

    assert response.status_code == 400
    assert response.json()["data"]["conflict"]["type"] == "group"


def test_back_to_back_lessons_are_not_a_conflict():
    org, (g1, g2, _g3), client = _setup("05")
    assert _post(client, org, g1, "10:00", "11:00", room="Room A").status_code == 201
    assert _post(client, org, g2, "11:00", "12:00", room="Room A").status_code == 201


def test_cancelled_lessons_dont_block_the_slot():
    org, (g1, _g2, g3), client = _setup("06")
    assert _post(client, org, g1, "12:00", "13:30", room="Room A", status="cancelled").status_code == 201
    assert _post(client, org, g3, "12:00", "13:30", room="Room A").status_code == 201


def test_rescheduling_into_a_taken_room_is_rejected():
    org, (g1, _g2, g3), client = _setup("07")
    assert _post(client, org, g1, "12:00", "13:30", room="Room A").status_code == 201
    other_id = _post(client, org, g3, "15:00", "16:00", room="Room A").json()["data"]["id"]

    response = client.patch(f"/api/v1/schedule/lessons/{other_id}/", {"start_time": "13:00"}, format="json")

    assert response.status_code == 400
    assert response.json()["data"]["conflict"]["type"] == "room"


def test_reactivating_a_cancelled_lesson_into_a_conflict_is_rejected():
    org, (g1, _g2, g3), client = _setup("08")
    cancelled_id = _post(client, org, g1, "12:00", "13:30", room="Room A", status="cancelled").json()["data"]["id"]
    assert _post(client, org, g3, "12:00", "13:30", room="Room A").status_code == 201

    response = client.patch(f"/api/v1/schedule/lessons/{cancelled_id}/", {"status": "scheduled"}, format="json")

    assert response.status_code == 400


def test_status_change_on_an_already_overlapping_lesson_is_allowed():
    """Lessons saved before this check existed may already overlap; marking
    one completed must not be blocked by that."""
    org, (g1, _g2, g3), client = _setup("09")
    first = Lesson.objects.using(BYPASS_ALIAS).create(
        organization=org, group=g1, date=DATE, start_time="12:00", end_time="13:30", room="Room A",
    )
    Lesson.objects.using(BYPASS_ALIAS).create(
        organization=org, group=g3, date=DATE, start_time="12:00", end_time="13:30", room="Room A",
    )

    response = client.patch(f"/api/v1/schedule/lessons/{first.id}/", {"status": "completed"}, format="json")

    assert response.status_code == 200


def test_end_time_not_after_start_time_is_a_validation_error():
    org, (g1, _g2, _g3), client = _setup("10")

    response = _post(client, org, g1, "13:00", "12:00")

    assert response.status_code == 400
    assert "end_time" in response.json()["data"]


def test_same_group_slot_can_be_booked_again_after_delete_or_cancel():
    """uq_lessons_group_date_start covers live, non-cancelled rows only; it
    used to count soft-deleted and cancelled lessons and 500 on re-booking."""
    org, (g1, _g2, _g3), client = _setup("11")
    deleted_id = _post(client, org, g1, "12:00", "13:30").json()["data"]["id"]
    assert client.delete(f"/api/v1/schedule/lessons/{deleted_id}/").status_code == 200
    cancelled_id = _post(client, org, g1, "12:00", "13:30").json()["data"]["id"]
    assert client.patch(f"/api/v1/schedule/lessons/{cancelled_id}/", {"status": "cancelled"}, format="json").status_code == 200

    assert _post(client, org, g1, "12:00", "13:30").status_code == 201
