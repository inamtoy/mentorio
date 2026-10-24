"""Files attached to homework — an Assignment's materials (teacher) or a
Submission's work (student). Stored as foundation.File rows linked through
File.entity_type/entity_id, the registry's polymorphic link, so homework
needs no table of its own.

Flow: the client uploads each file first (HomeworkAttachmentUploadView,
which leaves it unlinked), then sends the ids as `attachment_ids` when it
creates or edits the assignment/submission; the serializer links them here.
"""

from __future__ import annotations

from django.utils import timezone
from rest_framework import serializers

from common.permissions import user_has_permission
from foundation.models import File

CATEGORY = "homework"
ENTITY_ASSIGNMENT = "assignment"
ENTITY_SUBMISSION = "submission"
MAX_ATTACHMENTS = 5


class AttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = File
        fields = ["id", "original_name", "mime_type", "size_bytes", "created_at"]
        read_only_fields = fields


def attachments_of(entity_type: str, entity_id):
    return File.objects.filter(category=CATEGORY, entity_type=entity_type, entity_id=entity_id).order_by("created_at")


def validate_attachment_ids(file_ids, *, user, entity_type: str, instance) -> list:
    """Only files the caller uploaded themselves and hasn't attached yet,
    or ones already on this very record — so nobody can pull another
    user's upload, or another record's attachment, onto their own."""
    unique_ids = list(dict.fromkeys(file_ids))
    files = {f.id: f for f in File.objects.filter(id__in=unique_ids, category=CATEGORY)}
    for file_id in unique_ids:
        file = files.get(file_id)
        if file is None:
            raise serializers.ValidationError("One of the attached files no longer exists. Remove it and upload it again.")
        if file.entity_id is None:
            if file.uploaded_by_id != user.id:
                raise serializers.ValidationError("You can only attach files you uploaded yourself.")
        elif instance is None or file.entity_type != entity_type or file.entity_id != instance.id:
            raise serializers.ValidationError("One of the files is already attached elsewhere. Upload it again.")
    return unique_ids


def set_attachments(entity_type: str, instance, file_ids: list) -> None:
    """Makes `file_ids` the record's attachments: links the new ones and
    soft-deletes the ones that were removed (the bytes stay on disk, so a
    removal can be undone the same way as any other soft delete)."""
    attachments_of(entity_type, instance.id).exclude(id__in=file_ids).update(deleted_at=timezone.now())
    File.objects.filter(id__in=file_ids, entity_id__isnull=True).update(entity_type=entity_type, entity_id=instance.id)


def can_download(user, file: File) -> bool:
    """Who may read an attachment — the same people who may see the record
    it belongs to, scoped the way homework/views.py scopes rows: a student
    their own groups' assignments and their own submissions, a teacher the
    groups they teach, a center admin everything in their center (RLS keeps
    other centers out regardless)."""
    from groups.models import GroupMember
    from homework.models import Assignment, Submission

    if file.entity_id is None:
        return file.uploaded_by_id == user.id

    student_profile = getattr(user, "student_profile", None)
    teacher_profile = getattr(user, "teacher_profile", None)

    if file.entity_type == ENTITY_ASSIGNMENT:
        assignment = Assignment.objects.select_related("group").filter(id=file.entity_id).first()
        if assignment is None:
            return False
        if student_profile is not None:
            return GroupMember.objects.filter(
                group_id=assignment.group_id, student_profile=student_profile, status="active"
            ).exists()
        if teacher_profile is not None:
            return assignment.group.teacher_id == teacher_profile.id
        return user_has_permission(user, "assignments", "view")

    if file.entity_type == ENTITY_SUBMISSION:
        submission = Submission.objects.select_related("assignment__group").filter(id=file.entity_id).first()
        if submission is None:
            return False
        if student_profile is not None:
            return submission.student_profile_id == student_profile.id
        if teacher_profile is not None:
            return submission.assignment.group.teacher_id == teacher_profile.id
        return user_has_permission(user, "submissions", "view")

    return False


class AttachmentFieldsMixin:
    """Adds `attachments` (read) and `attachment_ids` (write) to a homework
    ModelSerializer. Set `attachment_entity_type` on the serializer and list
    both fields in Meta.fields."""

    attachment_entity_type: str

    def get_attachments(self, obj):
        return AttachmentSerializer(attachments_of(self.attachment_entity_type, obj.id), many=True).data

    def validate_attachment_ids(self, value):
        return validate_attachment_ids(
            value, user=self.context["request"].user, entity_type=self.attachment_entity_type, instance=self.instance
        )

    def create(self, validated_data):
        file_ids = validated_data.pop("attachment_ids", None)
        instance = super().create(validated_data)
        if file_ids is not None:
            set_attachments(self.attachment_entity_type, instance, file_ids)
        return instance

    def update(self, instance, validated_data):
        file_ids = validated_data.pop("attachment_ids", None)
        instance = super().update(instance, validated_data)
        if file_ids is not None:
            set_attachments(self.attachment_entity_type, instance, file_ids)
        return instance
