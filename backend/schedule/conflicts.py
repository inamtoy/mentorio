"""Double-booking checks for lessons.

A lesson conflicts with another live, non-cancelled lesson in the same
organization on the same date whose time overlaps it (touching end-to-start,
e.g. 10:00–11:00 then 11:00–12:00, is not an overlap) and that uses:

- the same room (compared case-insensitively, ignoring surrounding spaces;
  lessons without a room never conflict on room), or
- the same group (its students can't be in two lessons at once), or
- the same teacher (Lesson has no teacher column — it's group.teacher).
"""

from django.db import connection

from schedule.models import Lesson

ROOM = "room"
TEACHER = "teacher"
GROUP = "group"


def lock_lessons_for_day(organization_id, date) -> None:
    """Serializes lesson writes for one organization and date until the
    surrounding transaction ends (OrganizationContextMiddleware wraps every
    request in one), so two concurrent requests can't both pass the conflict
    check and then both save."""
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))",
            [f"schedule.lesson:{organization_id}:{date.isoformat()}"],
        )


def _normalize_room(room) -> str:
    return (room or "").strip().casefold()


def find_conflict(*, organization_id, group, date, start_time, end_time, room, exclude_id=None):
    """Returns (kind, lesson) for the first conflicting lesson, or None.
    Room is checked first, since it's the one the user can usually fix by
    picking another value in the same form; same group before same teacher,
    since a group's own lesson is the more specific explanation."""
    candidates = (
        Lesson.objects.filter(
            organization_id=organization_id,
            date=date,
            start_time__lt=end_time,
            end_time__gt=start_time,
        )
        .exclude(status="cancelled")
        .select_related("group__teacher__user")
        .order_by("start_time")
    )
    if exclude_id is not None:
        candidates = candidates.exclude(id=exclude_id)
    candidates = list(candidates)

    room_key = _normalize_room(room)
    if room_key:
        for other in candidates:
            if _normalize_room(other.room) == room_key:
                return ROOM, other

    for other in candidates:
        if other.group_id == group.id:
            return GROUP, other

    if group.teacher_id is not None:
        for other in candidates:
            if other.group.teacher_id == group.teacher_id:
                return TEACHER, other

    return None
