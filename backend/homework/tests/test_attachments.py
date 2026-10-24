"""Homework attachments — homework/attachments.py and the upload/download
views in homework/views.py. Same fixture style as test_homework.py (real
logins, setup through the auth_bypass_rls alias). Files go to a per-test
MEDIA_ROOT under tmp_path.
"""

import uuid

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from common.context import apply_org_context
from course.models import Course
from foundation.models import File, Organization, Role, User, UserRole
from groups.models import Group, GroupMember
from student.models import StudentProfile
from teacher.models import TeacherProfile

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"
PDF = b"%PDF-1.4\n% test\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.fixture(autouse=True)
def media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path / "media"
    return settings.MEDIA_ROOT


def _make_org():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-hw-files-{uuid.uuid4().hex[:8]}", email="a@example.com"
        )


def _make_login(org, phone, role_slug):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="U", last_name=phone[-4:], password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug=role_slug)
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    return user


def _client(user):
    client = APIClient()
    response = client.post("/api/v1/auth/login/", {"login_id": user.login_id, "password": "pw123456"}, format="json")
    assert response.status_code == 200
    return client


def _setup(suffix):
    """A teacher with a group holding one student, plus a student outside it."""
    org = _make_org()
    teacher_user = _make_login(org, f"+99890500{suffix}1", "teacher")
    teacher = TeacherProfile.objects.using(BYPASS_ALIAS).create(organization=org, user=teacher_user, teacher_code=f"TCH-{suffix}")
    course = Course.objects.using(BYPASS_ALIAS).create(organization=org, name="Course", code=f"CRS-{suffix}", category="General")
    group = Group.objects.using(BYPASS_ALIAS).create(
        organization=org, course=course, teacher=teacher, code=f"GRP-{suffix}", name="Group", start_date="2026-09-01"
    )
    member_user = _make_login(org, f"+99890500{suffix}2", "student")
    member = StudentProfile.objects.using(BYPASS_ALIAS).create(organization=org, user=member_user, student_code=f"STU-{suffix}1")
    GroupMember.objects.using(BYPASS_ALIAS).create(organization=org, group=group, student_profile=member, status="active")
    outsider_user = _make_login(org, f"+99890500{suffix}3", "student")
    StudentProfile.objects.using(BYPASS_ALIAS).create(organization=org, user=outsider_user, student_code=f"STU-{suffix}2")
    return org, group, teacher_user, member_user, outsider_user


def _upload(client, name, content):
    return client.post("/api/v1/homework/attachments/", {"file": SimpleUploadedFile(name, content)}, format="multipart")


def _create_assignment(client, org, group, attachment_ids):
    return client.post(
        "/api/v1/homework/assignments/",
        {
            "organization": str(org.id), "group": str(group.id), "title": "HW", "due_date": "2026-12-01",
            "attachment_ids": attachment_ids,
        },
        format="json",
    )


def test_teacher_attaches_a_file_and_only_group_members_can_download_it(media_root):
    org, group, teacher_user, member_user, outsider_user = _setup("01")
    teacher = _client(teacher_user)

    upload = _upload(teacher, "task.pdf", PDF)
    assert upload.status_code == 201, upload.json()
    file_id = upload.json()["data"]["id"]
    assignment = _create_assignment(teacher, org, group, [file_id])
    assert assignment.status_code == 201, assignment.json()
    assert [a["original_name"] for a in assignment.json()["data"]["attachments"]] == ["task.pdf"]

    url = f"/api/v1/homework/attachments/{file_id}/download/"
    member_download = _client(member_user).get(url)
    assert member_download.status_code == 200
    assert b"".join(member_download.streaming_content) == PDF
    assert "attachment" in member_download["Content-Disposition"]
    assert _client(outsider_user).get(url).status_code == 404


def test_student_submits_with_a_photo_and_the_teacher_can_download_it():
    org, group, teacher_user, member_user, outsider_user = _setup("02")
    assignment_id = _create_assignment(_client(teacher_user), org, group, []).json()["data"]["id"]
    student = _client(member_user)

    file_id = _upload(student, "page1.png", PNG).json()["data"]["id"]
    submission = student.post(
        "/api/v1/homework/submissions/",
        {"organization": str(org.id), "assignment": assignment_id, "content": "", "attachment_ids": [file_id]},
        format="json",
    )
    assert submission.status_code == 201, submission.json()

    url = f"/api/v1/homework/attachments/{file_id}/download/"
    assert _client(teacher_user).get(url).status_code == 200
    assert _client(outsider_user).get(url).status_code == 404


@pytest.mark.parametrize(
    ("name", "content"),
    [
        ("page.html", b"<html><script>alert(1)</script></html>"),  # type not allowed
        ("fake.pdf", b"MZ\x90\x00 not really a pdf"),  # extension doesn't match the bytes
    ],
)
def test_disallowed_or_disguised_files_are_rejected(name, content):
    _org, _group, teacher_user, _member, _outsider = _setup("03")

    response = _upload(_client(teacher_user), name, content)

    assert response.status_code == 400
    assert "file" in response.json()["data"]
    assert not File.objects.using(BYPASS_ALIAS).filter(original_name=name).exists()


def test_files_over_10_mb_are_rejected():
    _org, _group, teacher_user, _member, _outsider = _setup("04")

    response = _upload(_client(teacher_user), "big.pdf", PDF + b"0" * (10 * 1024 * 1024))

    assert response.status_code == 400


def test_cannot_attach_someone_elses_upload():
    org, group, teacher_user, member_user, _outsider = _setup("05")
    student_file = _upload(_client(member_user), "mine.pdf", PDF).json()["data"]["id"]

    response = _create_assignment(_client(teacher_user), org, group, [student_file])

    assert response.status_code == 400
    assert File.objects.using(BYPASS_ALIAS).get(id=student_file).entity_id is None


def test_removing_an_attachment_soft_deletes_it():
    org, group, teacher_user, _member, _outsider = _setup("06")
    teacher = _client(teacher_user)
    keep = _upload(teacher, "keep.pdf", PDF).json()["data"]["id"]
    drop = _upload(teacher, "drop.pdf", PDF).json()["data"]["id"]
    assignment_id = _create_assignment(teacher, org, group, [keep, drop]).json()["data"]["id"]

    response = teacher.patch(f"/api/v1/homework/assignments/{assignment_id}/", {"attachment_ids": [keep]}, format="json")

    assert response.status_code == 200
    assert [a["id"] for a in response.json()["data"]["attachments"]] == [keep]
    assert File.all_objects.using(BYPASS_ALIAS).get(id=drop).deleted_at is not None
