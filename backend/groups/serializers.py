from rest_framework import serializers

from finance.services import group_monthly_price
from groups.models import Group, GroupMember


class GroupSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)
    course_name = serializers.CharField(source="course.name", read_only=True)
    course_level = serializers.CharField(source="course.level", read_only=True)
    teacher_name = serializers.CharField(source="teacher.user.get_full_name", read_only=True)
    enrolled_count = serializers.SerializerMethodField()
    # What enrolling a student actually bills per month — the Group's own
    # price, or its Course's when unset. Lets the frontend show/prefill it
    # without re-implementing the fallback.
    effective_price = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = [
            "id", "organization", "branch", "branch_name", "course", "course_name", "course_level",
            "teacher", "teacher_name", "name", "code", "status", "max_students", "enrolled_count",
            "start_date", "end_date", "room", "days_of_week", "start_time", "end_time", "price",
            "effective_price", "currency", "billing_day", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "code", "created_at", "updated_at"]

    def get_enrolled_count(self, obj) -> int:
        return obj.members.filter(status="active").count()

    def get_effective_price(self, obj) -> str | None:
        price = group_monthly_price(obj)
        return str(price) if price is not None else None

    def create(self, validated_data):
        from common.codegen import generate_unique_code

        validated_data["code"] = generate_unique_code(Group, validated_data["organization"], validated_data["name"])
        return super().create(validated_data)


class GroupMemberSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student_profile.user.get_full_name", read_only=True)
    student_login_id = serializers.CharField(source="student_profile.user.login_id", read_only=True)
    student_phone = serializers.CharField(source="student_profile.user.phone", read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True)
    course_name = serializers.CharField(source="group.course.name", read_only=True)
    # Enrolling bills the first month by default (see
    # GroupMemberViewSet.perform_create) — false skips it, e.g. a free trial.
    create_invoice = serializers.BooleanField(write_only=True, required=False, default=True)

    class Meta:
        model = GroupMember
        fields = [
            "id", "organization", "group", "group_name", "course_name", "student_profile", "student_name",
            "student_login_id", "student_phone", "status", "completed_at", "dropped_at", "drop_reason",
            "create_invoice", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        group = attrs.get("group") or getattr(self.instance, "group", None)
        if group is not None and not self.instance:
            active_count = group.members.filter(status="active").count()
            if active_count >= group.max_students:
                raise serializers.ValidationError(
                    {"group": f"This group is at capacity ({group.max_students} students)."}
                )
        return attrs
