from django.utils import timezone
from rest_framework import serializers

from attendance.models import Attendance


class AttendanceSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student_profile.user.get_full_name", read_only=True)
    student_login_id = serializers.CharField(source="student_profile.user.login_id", read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True)
    course_name = serializers.CharField(source="group.course.name", read_only=True)

    class Meta:
        model = Attendance
        fields = [
            "id", "organization", "group", "group_name", "course_name", "student_profile", "student_name",
            "student_login_id", "date", "status", "notes", "marked_by", "marked_at", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "marked_by", "marked_at", "created_at", "updated_at"]

    def validate_date(self, value):
        # Applies to every role: a record says who showed up, which can't be
        # known in advance. The stricter teacher-only-today rule lives in
        # AttendanceViewSet._check_date_allowed, since it depends on who asks.
        if value > timezone.localdate():
            raise serializers.ValidationError(
                "Attendance can't be marked for a future date. Pick today or an earlier day."
            )
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            validated_data["marked_by"] = request.user.id
        validated_data["marked_at"] = timezone.now()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            validated_data["marked_by"] = request.user.id
        validated_data["marked_at"] = timezone.now()
        return super().update(instance, validated_data)
