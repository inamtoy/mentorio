"""Who may see and change student data inside one organization — see
student/views.py::visible_student_profiles and StudentSubResourceMixin.

Before this, `students:view` (held by every role) let any student list
every classmate's profile, parents, emergency contacts and documents, and
`students:update` let them rewrite a classmate's parent phone. The Student
portal itself downloaded the whole list on every page load.

Same real-login fixture style as test_student_profile_authorization.py.
"""

import uuid

import pytest
from django.db import transaction as db_transaction
from rest_framework.test import APIClient

from common.context import apply_org_context
from course.models import Course
from foundation.models import Organization, Role, User, UserRole
from groups.models import Group, GroupMember
from student.models import EmergencyContact, StudentDocument, StudentParent, StudentProfile
from teacher.models import TeacherProfile

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _make_org():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Org", slug=f"org-scoping-test-{uuid.uuid4().hex[:8]}", email="a@example.com"
        )


def _make_user(org, phone, role_slug):
    user = User.objects.db_manager(BYPASS_ALIAS).create_user(
        organization=org, first_name="U", last_name=phone[-4:], password="pw123456", phone=phone, status="active",
    )
    role = Role.objects.using(BYPASS_ALIAS).get(organization=org, slug=role_slug)
    UserRole.objects.using(BYPASS_ALIAS).create(user=user, role=role, organization=org)
    return user


def _make_student(org, phone):
    user = _make_user(org, phone, "student")
    profile = StudentProfile.objects.using(BYPASS_ALIAS).create(organization=org, user=user, student_code=f"STU-{phone[-9:]}")
    return user, profile


def _make_teacher(org, phone):
    user = _make_user(org, phone, "teacher")
    profile = TeacherProfile.objects.using(BYPASS_ALIAS).create(organization=org, user=user, teacher_code=f"TCH-{phone[-9:]}")
    return user, profile


def _make_group(org, teacher, code):
    course = Course.objects.using(BYPASS_ALIAS).create(organization=org, name="Course", code=f"CRS-{code}", category="General")
    return Group.objects.using(BYPASS_ALIAS).create(
        organization=org, course=course, teacher=teacher, code=code, name=code, start_date="2026-09-01"
    )


def _enroll(org, group, student):
    GroupMember.objects.using(BYPASS_ALIAS).create(organization=org, group=group, student_profile=student)


def _login(user):
    client = APIClient()
    response = client.post("/api/v1/auth/login/", {"login_id": user.login_id, "password": "pw123456"}, format="json")
    assert response.status_code == 200, response.content
    return client


def _ids(response):
    assert response.status_code == 200, response.content
    return {row["id"] for row in response.json()["data"]["results"]}


def _parent(org, student, phone):
    return StudentParent.objects.using(BYPASS_ALIAS).create(
        organization=org, student_profile=student, relation="mother", first_name="P", last_name="X", phone=phone
    )


# ─── Student ─────────────────────────────────────────────────────────────────


def test_student_lists_only_their_own_profile():
    org = _make_org()
    me_user, me = _make_student(org, "+998931000001")
    _make_student(org, "+998931000002")

    client = _login(me_user)

    assert _ids(client.get("/api/v1/students/")) == {str(me.id)}


def test_student_cannot_retrieve_a_classmates_profile():
    org = _make_org()
    me_user, _me = _make_student(org, "+998931000003")
    _other_user, other = _make_student(org, "+998931000004")

    response = _login(me_user).get(f"/api/v1/students/{other.id}/")

    assert response.status_code == 404


def test_student_sees_only_their_own_parents_contacts_and_documents():
    org = _make_org()
    me_user, me = _make_student(org, "+998931000005")
    _other_user, other = _make_student(org, "+998931000006")
    mine = _parent(org, me, "+998931100005")
    _parent(org, other, "+998931100006")
    EmergencyContact.objects.using(BYPASS_ALIAS).create(
        organization=org, student_profile=other, full_name="E", relationship="uncle", phone_primary="+998931200006"
    )
    StudentDocument.objects.using(BYPASS_ALIAS).create(
        organization=org, student_profile=other, document_type="passport", title="Passport", document_number="AA1234567"
    )

    client = _login(me_user)

    assert _ids(client.get("/api/v1/students/parents/")) == {str(mine.id)}
    assert _ids(client.get("/api/v1/students/emergency-contacts/")) == set()
    assert _ids(client.get("/api/v1/students/documents/")) == set()


def test_student_cannot_change_a_classmates_parent():
    org = _make_org()
    me_user, _me = _make_student(org, "+998931000007")
    _other_user, other = _make_student(org, "+998931000008")
    their_parent = _parent(org, other, "+998931100008")

    response = _login(me_user).patch(
        f"/api/v1/students/parents/{their_parent.id}/", {"phone": "+998939999999"}, format="json"
    )

    assert response.status_code == 404
    their_parent.refresh_from_db(using=BYPASS_ALIAS)
    assert their_parent.phone == "+998931100008"


def test_student_cannot_change_even_their_own_parent():
    org = _make_org()
    me_user, me = _make_student(org, "+998931000009")
    my_parent = _parent(org, me, "+998931100009")

    client = _login(me_user)
    patch = client.patch(f"/api/v1/students/parents/{my_parent.id}/", {"phone": "+998939999998"}, format="json")
    create = client.post(
        "/api/v1/students/parents/",
        {"organization": str(org.id), "student_profile": str(me.id), "relation": "father", "first_name": "F", "last_name": "Y"},
        format="json",
    )
    delete = client.delete(f"/api/v1/students/parents/{my_parent.id}/")

    assert (patch.status_code, create.status_code, delete.status_code) == (403, 403, 403)


def test_student_cannot_change_their_own_status():
    org = _make_org()
    me_user, me = _make_student(org, "+998931000010")
    StudentProfile.objects.using(BYPASS_ALIAS).filter(pk=me.pk).update(status="suspended")

    response = _login(me_user).patch(f"/api/v1/students/{me.id}/", {"status": "active"}, format="json")

    assert response.status_code == 403
    me.refresh_from_db(using=BYPASS_ALIAS)
    assert me.status == "suspended"


def test_student_portal_empty_profile_patch_still_works():
    """lib/api/students.ts::updateStudent always PATCHes the profile, with
    an empty body when only name/phone changed (those go to /users/)."""
    org = _make_org()
    me_user, me = _make_student(org, "+998931000011")

    response = _login(me_user).patch(f"/api/v1/students/{me.id}/", {}, format="json")

    assert response.status_code == 200


# ─── Teacher ─────────────────────────────────────────────────────────────────


def test_teacher_sees_only_students_in_their_own_groups():
    org = _make_org()
    teacher_user, teacher = _make_teacher(org, "+998931000020")
    _other_teacher_user, other_teacher = _make_teacher(org, "+998931000021")
    _s1_user, mine = _make_student(org, "+998931000022")
    _s2_user, not_mine = _make_student(org, "+998931000023")
    _enroll(org, _make_group(org, teacher, "GRP-MINE"), mine)
    _enroll(org, _make_group(org, other_teacher, "GRP-OTHER"), not_mine)
    _parent(org, not_mine, "+998931100023")

    client = _login(teacher_user)

    assert _ids(client.get("/api/v1/students/")) == {str(mine.id)}
    assert _ids(client.get("/api/v1/students/parents/")) == set()


# ─── Admin ───────────────────────────────────────────────────────────────────


def test_center_admin_still_sees_and_edits_every_student():
    org = _make_org()
    admin = _make_user(org, "+998931000030", "center_admin")
    _s1_user, s1 = _make_student(org, "+998931000031")
    _s2_user, s2 = _make_student(org, "+998931000032")
    parent = _parent(org, s2, "+998931100032")

    client = _login(admin)

    assert {str(s1.id), str(s2.id)} <= _ids(client.get("/api/v1/students/"))
    assert client.patch(f"/api/v1/students/{s1.id}/", {"status": "active"}, format="json").status_code == 200
    assert client.patch(f"/api/v1/students/parents/{parent.id}/", {"phone": "+998931199999"}, format="json").status_code == 200


def test_teacher_sees_only_members_of_their_own_groups():
    """/groups/members/ carries student_phone/student_login_id — a teacher
    used to get every enrollment in the org from it."""
    org = _make_org()
    teacher_user, teacher = _make_teacher(org, "+998931000040")
    _other_teacher_user, other_teacher = _make_teacher(org, "+998931000041")
    _s1_user, mine = _make_student(org, "+998931000042")
    _s2_user, not_mine = _make_student(org, "+998931000043")
    my_group = _make_group(org, teacher, "GRP-T1")
    _enroll(org, my_group, mine)
    _enroll(org, _make_group(org, other_teacher, "GRP-T2"), not_mine)

    response = _login(teacher_user).get("/api/v1/groups/members/")

    assert response.status_code == 200
    rows = response.json()["data"]["results"]
    assert {row["student_profile"] for row in rows} == {str(mine.id)}
