from rest_framework import serializers

from auth_custom.services.phone import normalize_uz_phone
from common.codegen import generate_sequential_code
from notifications.services.telegram_links import parent_link_is_current
from student.models import EmergencyContact, StudentDocument, StudentParent, StudentProfile


class StudentProfileSerializer(serializers.ModelSerializer):
    user_full_name = serializers.CharField(source="user.get_full_name", read_only=True)
    user_login_id = serializers.CharField(source="user.login_id", read_only=True)
    user_phone = serializers.CharField(source="user.phone", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)

    class Meta:
        model = StudentProfile
        fields = [
            "id", "organization", "user", "user_full_name", "user_login_id", "user_phone",
            "branch", "branch_name",
            "student_code", "status", "enrollment_date", "graduation_date", "education_level",
            "school_name", "previous_institution", "medical_notes", "allergies", "blood_type",
            "notes", "metadata", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        # Optional: left blank, the server assigns the next STU-#### code
        # (create) or keeps the current one (update) — hand-typed codes were
        # error-prone (e.g. just "EDU") and nothing checked them.
        extra_kwargs = {"student_code": {"required": False, "allow_blank": True}}

    def get_validators(self):
        # DRF's auto (organization, student_code) unique-together validator
        # forces both fields to be present, defeating the optional code —
        # uniqueness of a code that *is* given is checked in validate().
        return []

    def validate(self, attrs):
        code = attrs.get("student_code", "").strip()
        organization = attrs.get("organization", getattr(self.instance, "organization", None))
        if code:
            taken = StudentProfile.all_objects.filter(organization=organization, student_code=code)
            if self.instance is not None:
                taken = taken.exclude(pk=self.instance.pk)
            if taken.exists():
                raise serializers.ValidationError(
                    {"student_code": "This student code is already used in your center. Leave it blank to get a new one."}
                )
        return attrs

    def create(self, validated_data):
        if not validated_data.get("student_code", "").strip():
            validated_data["student_code"] = generate_sequential_code(
                StudentProfile, validated_data["organization"], prefix="STU-", code_field="student_code"
            )
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "student_code" in validated_data and not validated_data["student_code"].strip():
            validated_data.pop("student_code")
        return super().update(instance, validated_data)


class StudentParentSerializer(serializers.ModelSerializer):
    # Whether this parent gets the child's notifications in Telegram — they
    # connect themselves by sharing their number with the bot.
    telegram_connected = serializers.SerializerMethodField()

    class Meta:
        model = StudentParent
        fields = [
            "id", "organization", "student_profile", "user", "relation", "first_name", "last_name",
            "phone", "email", "workplace", "occupation", "is_primary_contact", "can_pickup", "notes",
            "telegram_connected", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_phone(self, value):
        # Optional here (a parent may be reachable by email only), but a
        # number that is given must be a real one — the Telegram bot links
        # parents by matching it.
        if not value:
            return value
        try:
            return normalize_uz_phone(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def get_telegram_connected(self, obj) -> bool:
        link = getattr(obj, "telegram_link", None)
        return bool(link and link.active and parent_link_is_current(link))


class EmergencyContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyContact
        fields = [
            "id", "organization", "student_profile", "full_name", "relationship",
            "phone_primary", "phone_secondary", "address", "priority", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class StudentDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentDocument
        fields = [
            "id", "organization", "student_profile", "file", "document_type", "title",
            "document_number", "issued_by", "issued_date", "expiry_date", "is_verified",
            "verified_by", "verified_at", "notes", "created_by", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
