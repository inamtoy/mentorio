from rest_framework import serializers

from common.serializers import OptionalSequentialCodeMixin
from teacher.models import TeacherAvailability, TeacherDocument, TeacherProfile, TeacherSalary, TeacherSpecialization


class TeacherProfileSerializer(OptionalSequentialCodeMixin, serializers.ModelSerializer):
    code_field = "teacher_code"
    code_prefix = "TCH-"
    code_label = "teacher code"

    user_full_name = serializers.CharField(source="user.get_full_name", read_only=True)
    user_login_id = serializers.CharField(source="user.login_id", read_only=True)
    user_phone = serializers.CharField(source="user.phone", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)

    class Meta:
        model = TeacherProfile
        fields = [
            "id", "organization", "user", "user_full_name", "user_login_id", "user_phone", "branch", "branch_name",
            "teacher_code", "status", "employment_type", "hire_date", "termination_date", "bio",
            "experience_years", "education_degree", "university", "notes", "metadata",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {"teacher_code": {"required": False, "allow_blank": True}}


class TeacherSalarySerializer(serializers.ModelSerializer):
    class Meta:
        model = TeacherSalary
        fields = [
            "id", "organization", "teacher_profile", "salary_type", "amount", "currency",
            "percentage_value", "effective_from", "effective_to", "is_active", "notes",
            "created_by", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TeacherAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = TeacherAvailability
        fields = [
            "id", "organization", "teacher_profile", "day_of_week", "start_time", "end_time",
            "is_available", "effective_from", "effective_to", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TeacherSpecializationSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeacherSpecialization
        fields = [
            "id", "organization", "teacher_profile", "subject_name", "proficiency_level", "is_primary",
            "certificate_url", "years_experience", "notes", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class TeacherDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeacherDocument
        fields = [
            "id", "organization", "teacher_profile", "file", "document_type", "title",
            "document_number", "issued_by", "issued_date", "expiry_date", "is_verified",
            "verified_by", "verified_at", "notes", "created_by", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
