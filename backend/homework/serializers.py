from django.utils import timezone
from rest_framework import serializers

from groups.models import GroupMember
from homework.attachments import ENTITY_ASSIGNMENT, ENTITY_SUBMISSION, MAX_ATTACHMENTS, AttachmentFieldsMixin
from homework.models import Assignment, Submission
from student.models import StudentProfile


class AssignmentSerializer(AttachmentFieldsMixin, serializers.ModelSerializer):
    attachment_entity_type = ENTITY_ASSIGNMENT

    attachments = serializers.SerializerMethodField()
    attachment_ids = serializers.ListField(
        child=serializers.UUIDField(), write_only=True, required=False, max_length=MAX_ATTACHMENTS
    )
    group_name = serializers.CharField(source="group.name", read_only=True)
    total_students = serializers.SerializerMethodField()
    submitted_count = serializers.SerializerMethodField()
    graded_count = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = [
            "id", "organization", "group", "group_name", "title", "description", "due_date", "max_score", "status",
            "created_by", "total_students", "submitted_count", "graded_count", "attachments", "attachment_ids",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def get_total_students(self, obj) -> int:
        return GroupMember.objects.filter(group_id=obj.group_id, status="active").count()

    def get_submitted_count(self, obj) -> int:
        return obj.submissions.count()

    def get_graded_count(self, obj) -> int:
        return obj.submissions.filter(score__isnull=False).count()

    def create(self, validated_data):
        request = self.context.get("request")
        if request is not None and request.user.is_authenticated:
            validated_data["created_by"] = request.user.id
        return super().create(validated_data)


class SubmissionSerializer(AttachmentFieldsMixin, serializers.ModelSerializer):
    attachment_entity_type = ENTITY_SUBMISSION

    attachments = serializers.SerializerMethodField()
    attachment_ids = serializers.ListField(
        child=serializers.UUIDField(), write_only=True, required=False, max_length=MAX_ATTACHMENTS
    )
    assignment_title = serializers.CharField(source="assignment.title", read_only=True)
    student_name = serializers.CharField(source="student_profile.user.get_full_name", read_only=True)
    is_late = serializers.SerializerMethodField()
    # Not required at the serializer level even though the model column is
    # NOT NULL: a student submitting their own homework never sends this —
    # SubmissionViewSet.perform_create fills it in from request.user before
    # save(). Only a non-student (teacher/center_admin) creating on someone
    # else's behalf needs to supply it explicitly.
    student_profile = serializers.PrimaryKeyRelatedField(queryset=StudentProfile.objects.all(), required=False)

    class Meta:
        model = Submission
        fields = [
            "id", "organization", "assignment", "assignment_title", "student_profile", "student_name", "content",
            "submitted_at", "score", "feedback", "graded_by", "graded_at", "is_late", "attachments", "attachment_ids",
            "created_at",
        ]
        read_only_fields = ["id", "submitted_at", "graded_by", "graded_at", "created_at"]
        # ModelSerializer auto-adds a UniqueTogetherValidator from
        # Submission's (assignment, student_profile) UniqueConstraint —
        # which forces BOTH fields to be present in the input regardless of
        # student_profile's `required=False` above (a real DRF gotcha: that
        # validator does its own required-field enforcement independent of
        # the field's own `required`). Suppressed here; the same duplicate
        # check is done by hand in validate() below using the *effective*
        # student_profile (falls back to the requester's own profile, same
        # as SubmissionViewSet.perform_create), and the DB constraint is
        # still the final backstop either way.
        validators = []

    def get_is_late(self, obj) -> bool:
        return obj.submitted_at.date() > obj.assignment.due_date

    def validate(self, attrs):
        assignment = attrs.get("assignment") or getattr(self.instance, "assignment", None)
        score = attrs.get("score")
        if assignment is not None and score is not None and score > assignment.max_score:
            raise serializers.ValidationError({"score": f"Score cannot exceed the assignment's max score ({assignment.max_score})."})

        if self.instance is None:
            request = self.context.get("request")
            student_profile = attrs.get("student_profile")
            if student_profile is None and request is not None:
                student_profile = getattr(request.user, "student_profile", None)
            if assignment is not None and student_profile is not None:
                if Submission.objects.filter(assignment=assignment, student_profile=student_profile).exists():
                    raise serializers.ValidationError("You have already submitted this assignment.")

        return attrs

    def update(self, instance, validated_data):
        """Grading (`score` newly set/changed) stamps `graded_by`/`graded_at`
        server-side — same reasoning as Notification.read/read_at: never
        trust a client-sent timestamp for a server-owned fact.
        """
        request = self.context.get("request")
        if "score" in validated_data and validated_data["score"] != instance.score:
            if request is not None and request.user.is_authenticated:
                validated_data["graded_by"] = request.user.id
            validated_data["graded_at"] = timezone.now()
        return super().update(instance, validated_data)
