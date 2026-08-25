from rest_framework import serializers

from billing.serializers import SubscriptionPlanSummarySerializer
from foundation.models import ApiKey, AuditLog, Branch, Organization, Permission, PlatformBackup, Role, User
from foundation.password_policy import validate_password_policy


class OrganizationSerializer(serializers.ModelSerializer):
    """`branch_count`/`student_count`/`teacher_count` back the Super-Admin
    Centers table's columns of the same name — computed, not stored, same
    "derive from real records" precedent as Course's group_count or
    Assignment's submitted_count. No `owner` field: the mock Center had one
    (a person's name), but Organization has no owner/primary-contact user
    FK — dropped rather than invented, same as Student's mock
    attendanceRate/balance were dropped when their real modules didn't
    exist yet.
    """

    branch_count = serializers.SerializerMethodField()
    student_count = serializers.SerializerMethodField()
    teacher_count = serializers.SerializerMethodField()
    # `subscription_plan` (writable, plain FK id) is enough to assign a
    # plan; this read-only nested field spares the frontend a second round
    # trip to show the plan's name/price on the Centers table/detail panel.
    subscription_plan_detail = SubscriptionPlanSummarySerializer(source="subscription_plan", read_only=True)

    class Meta:
        model = Organization
        fields = [
            "id", "name", "slug", "legal_name", "tax_id", "logo_url", "website",
            "email", "phone", "address_line1", "address_line2", "city", "state",
            "country", "postal_code", "timezone", "locale", "currency", "status",
            "subscription_plan", "subscription_plan_detail", "max_students", "max_teachers", "max_branches",
            "trial_ends_at", "subscription_ends_at", "branch_count", "student_count",
            "teacher_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_branch_count(self, obj) -> int:
        return obj.branch_set.count()

    def get_student_count(self, obj) -> int:
        from student.models import StudentProfile

        return StudentProfile.objects.filter(organization=obj).count()

    def get_teacher_count(self, obj) -> int:
        from teacher.models import TeacherProfile

        return TeacherProfile.objects.filter(organization=obj).count()


class BranchSerializer(serializers.ModelSerializer):
    """`student_count`/`teacher_count` back the Super-Admin Branches table
    — computed, not stored, same precedent as OrganizationSerializer's own
    counts above. No `manager`/`working_hours` fields: the mock Branch had
    both, Branch has neither a manager/owner user FK nor a hours column —
    dropped rather than invented.
    """

    organization_name = serializers.CharField(source="organization.name", read_only=True)
    student_count = serializers.SerializerMethodField()
    teacher_count = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = [
            "id", "organization", "organization_name", "name", "code", "phone", "email",
            "address_line1", "address_line2", "city", "state", "country", "postal_code",
            "latitude", "longitude", "timezone", "is_main", "is_active", "student_count",
            "teacher_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_student_count(self, obj) -> int:
        from student.models import StudentProfile

        return StudentProfile.objects.filter(branch=obj).count()

    def get_teacher_count(self, obj) -> int:
        from teacher.models import TeacherProfile

        return TeacherProfile.objects.filter(branch=obj).count()


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "module", "action", "description"]
        read_only_fields = ["id"]


class PlatformBackupSerializer(serializers.ModelSerializer):
    triggered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PlatformBackup
        fields = [
            "id", "status", "triggered_by", "triggered_by_name", "started_at", "finished_at",
            "size_bytes", "error_message", "created_at",
        ]
        read_only_fields = fields

    def get_triggered_by_name(self, obj) -> str | None:
        return obj.triggered_by.get_full_name() if obj.triggered_by_id else None


class ApiKeySerializer(serializers.ModelSerializer):
    """Never serializes `key_hash` — the raw secret itself is never even
    stored, see foundation.services.generate_api_key()."""

    created_by_name = serializers.SerializerMethodField()
    is_revoked = serializers.SerializerMethodField()

    class Meta:
        model = ApiKey
        fields = [
            "id", "name", "key_prefix", "created_by", "created_by_name",
            "last_used_at", "revoked_at", "is_revoked", "created_at",
        ]
        read_only_fields = fields

    def get_created_by_name(self, obj) -> str | None:
        return obj.created_by.get_full_name() if obj.created_by_id else None

    def get_is_revoked(self, obj) -> bool:
        return obj.revoked_at is not None


class RoleSerializer(serializers.ModelSerializer):
    permission_ids = serializers.PrimaryKeyRelatedField(
        source="role_permissions",
        many=True,
        read_only=True,
        default=[],
    )

    class Meta:
        model = Role
        fields = [
            "id", "organization", "name", "slug", "description",
            "is_system", "is_active", "permission_ids", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "is_system", "created_at", "updated_at"]


class UserSerializer(serializers.ModelSerializer):
    """Covers the "Administrators" surface on the Super-Admin frontend:
    name/phone/center/branch/role/status. Password is write-only and
    optional on update (blank means "keep current", matching the frontend
    form's "leave blank to keep current" pattern already built).
    """

    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    role_ids = serializers.PrimaryKeyRelatedField(
        source="user_roles", queryset=Role.objects.all(), many=True, required=False, write_only=True
    )
    roles = serializers.SerializerMethodField(read_only=True)
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    organization_name = serializers.CharField(source="organization.name", read_only=True, default=None)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)

    class Meta:
        model = User
        fields = [
            "id", "organization", "organization_name", "branch", "branch_name", "login_id", "member_code",
            "first_name", "last_name", "middle_name", "full_name", "phone",
            "password", "avatar_url", "gender", "date_of_birth", "status", "language",
            "role_ids", "roles", "last_login", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "login_id", "member_code", "last_login", "created_at", "updated_at"]

    def get_roles(self, obj):
        return [
            {"id": str(ur.role_id), "name": ur.role.name, "slug": ur.role.slug}
            for ur in obj.user_roles.select_related("role").all()
        ]

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        role_ids = validated_data.pop("user_roles", [])
        if not password:
            raise serializers.ValidationError({"password": "Password is required to create a user."})
        validate_password_policy(password)
        user = User.objects.create_user(password=password, **validated_data)
        self._sync_roles(user, role_ids)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        role_ids = validated_data.pop("user_roles", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            validate_password_policy(password)
            instance.set_password(password)
        instance.save()
        if role_ids is not None:
            self._sync_roles(instance, role_ids)
        return instance

    def _sync_roles(self, user, roles):
        from foundation.models import UserRole

        if not roles:
            return
        UserRole.objects.filter(user=user).exclude(role__in=roles).delete()
        for role in roles:
            UserRole.objects.get_or_create(user=user, role=role, organization=user.organization)


class AuditLogSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="organization.name", read_only=True, default=None)
    user_name = serializers.CharField(source="user.get_full_name", read_only=True, default=None)
    user_login_id = serializers.CharField(source="user.login_id", read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = [
            "id", "organization", "organization_name", "user", "user_name", "user_login_id", "action",
            "entity_type", "entity_id", "old_values", "new_values", "ip_address", "user_agent", "metadata",
            "created_at",
        ]
        read_only_fields = fields
