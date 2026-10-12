from rest_framework import serializers

from schedule.conflicts import GROUP, ROOM, find_conflict, lock_lessons_for_day
from schedule.models import Lesson

# Fields whose change can create a double booking. Updating anything else
# (e.g. marking an already-overlapping legacy lesson completed) skips the check.
_CONFLICT_FIELDS = ("group", "date", "start_time", "end_time", "room")


class LessonSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source="group.name", read_only=True)
    course_name = serializers.CharField(source="group.course.name", read_only=True, default=None)
    course_color = serializers.CharField(source="group.course.color", read_only=True, default=None)
    teacher_id = serializers.UUIDField(source="group.teacher_id", read_only=True)
    teacher_name = serializers.CharField(source="group.teacher.user.get_full_name", read_only=True)

    class Meta:
        model = Lesson
        fields = [
            "id", "organization", "group", "group_name", "course_name", "course_color", "teacher_id", "teacher_name",
            "date", "start_time", "end_time", "room", "topic", "status", "notes", "created_by", "updated_by",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "updated_by", "created_at", "updated_at"]

    def validate(self, attrs):
        def current(field):
            return attrs[field] if field in attrs else getattr(self.instance, field, None)

        start_time, end_time = current("start_time"), current("end_time")
        if start_time is not None and end_time is not None and end_time <= start_time:
            raise serializers.ValidationError({"end_time": ["End time must be after the start time."]})

        if current("status") == "cancelled":
            return attrs
        if self.instance is not None:
            changed = any(f in attrs and attrs[f] != getattr(self.instance, f) for f in _CONFLICT_FIELDS)
            reactivated = self.instance.status == "cancelled" and "status" in attrs
            if not (changed or reactivated):
                return attrs

        group, date = current("group"), current("date")
        organization_id = group.organization_id
        lock_lessons_for_day(organization_id, date)
        found = find_conflict(
            organization_id=organization_id,
            group=group,
            date=date,
            start_time=start_time,
            end_time=end_time,
            room=current("room"),
            exclude_id=getattr(self.instance, "id", None),
        )
        if found is not None:
            raise serializers.ValidationError(_conflict_error(*found))
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            validated_data["created_by"] = request.user.id
        return super().create(validated_data)

    def update(self, instance, validated_data):
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            validated_data["updated_by"] = request.user.id
        return super().update(instance, validated_data)


def _conflict_error(kind, other):
    """English message for API clients, plus `conflict` so the frontend can
    show the same thing in the user's language (lib/api/schedule.ts)."""
    when = f"{other.date.isoformat()} {other.start_time:%H:%M}–{other.end_time:%H:%M}"
    teacher_name = other.group.teacher.user.get_full_name() if other.group.teacher_id else None
    if kind == ROOM:
        field = "room"
        message = f"{other.room} is already booked {when} by group {other.group.name}. Choose another room or time."
    elif kind == GROUP:
        field = "start_time"
        message = f"Group {other.group.name} already has a lesson {when}. Choose another time."
    else:
        field = "start_time"
        message = (
            f"{teacher_name} already teaches group {other.group.name} {when}. Choose another time."
        )
    return {
        field: [message],
        "conflict": {
            "type": kind,
            "lesson_id": str(other.id),
            "group_name": other.group.name,
            "teacher_name": teacher_name or "",
            "room": other.room or "",
            "date": other.date.isoformat(),
            "start_time": f"{other.start_time:%H:%M}",
            "end_time": f"{other.end_time:%H:%M}",
        },
    }
