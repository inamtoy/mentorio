from collections import defaultdict

from rest_framework.response import Response
from rest_framework.views import APIView

from attendance.models import Attendance
from common.permissions import HasModulePermission
from exams.models import ExamResult
from groups.models import Group, GroupMember
from homework.models import Submission

# Business rules (confirmed with the product owner, not invented here) shared
# by TeacherGradeSummaryView and StudentGradeSummaryView below:
# - `assignment_avg`/`exam_avg` are the mean of each graded Submission's/
#   ExamResult's score-as-a-percentage-of-that-item's-own-max_score (items
#   don't all share one point scale, so this normalizes before averaging —
#   same reasoning as the Admin Exams page's avgScoreAcrossCompleted).
# - `attendance_pct` counts ONLY the "present" status as attended;
#   late/excused/early_leave/sick/absent all count as not-present.
# - `final_grade` is the mean of whichever of assignment_avg/exam_avg
#   actually exist — never a value silently dragged toward 0 by a missing
#   half. `None` ("no data yet") only when neither exists. Attendance is
#   its own field, deliberately not folded into this.
# - No letter grade — not asked for, not computed.
# - `trend` compares the 2 most recently graded events (Submission +
#   ExamResult combined, by `graded_at`) for that student in that group;
#   `None` until at least 2 exist.


def _gather_events(group_ids, student_ids):
    """One batched query per source (no N+1) — shared by both views below.
    Returns (assignment_events, exam_events, attendance_counts), each keyed
    by (student_profile_id, group_id):
    - assignment_events / exam_events: [(score_pct, graded_at), ...]
    - attendance_counts: [present_count, total_count]
    """
    assignment_events = defaultdict(list)
    for row in Submission.objects.filter(
        assignment__group_id__in=group_ids,
        student_profile_id__in=student_ids,
        score__isnull=False,
    ).values("student_profile_id", "assignment__group_id", "score", "assignment__max_score", "graded_at"):
        max_score = row["assignment__max_score"] or 0
        if max_score <= 0:
            continue
        pct = row["score"] / max_score * 100
        key = (row["student_profile_id"], row["assignment__group_id"])
        assignment_events[key].append((pct, row["graded_at"]))

    exam_events = defaultdict(list)
    for row in ExamResult.objects.filter(
        exam__group_id__in=group_ids,
        student_profile_id__in=student_ids,
        score__isnull=False,
    ).values("student_profile_id", "exam__group_id", "score", "exam__max_score", "graded_at"):
        max_score = row["exam__max_score"] or 0
        if max_score <= 0:
            continue
        pct = row["score"] / max_score * 100
        key = (row["student_profile_id"], row["exam__group_id"])
        exam_events[key].append((pct, row["graded_at"]))

    attendance_counts = defaultdict(lambda: [0, 0])
    for row in Attendance.objects.filter(
        group_id__in=group_ids, student_profile_id__in=student_ids
    ).values("student_profile_id", "group_id", "status"):
        key = (row["student_profile_id"], row["group_id"])
        attendance_counts[key][1] += 1
        if row["status"] == "present":
            attendance_counts[key][0] += 1

    return assignment_events, exam_events, attendance_counts


def _stats_for_key(key, assignment_events, exam_events, attendance_counts):
    """Reduces one (student_profile_id, group_id)'s events down to the
    {assignment_avg, exam_avg, attendance_pct, final_grade, trend} shape
    both views return — see the module-level rules comment above.
    """
    assignment_pcts = [pct for pct, _ in assignment_events.get(key, [])]
    exam_pcts = [pct for pct, _ in exam_events.get(key, [])]
    assignment_avg = round(sum(assignment_pcts) / len(assignment_pcts)) if assignment_pcts else None
    exam_avg = round(sum(exam_pcts) / len(exam_pcts)) if exam_pcts else None

    components = [v for v in (assignment_avg, exam_avg) if v is not None]
    final_grade = round(sum(components) / len(components)) if components else None

    present, total = attendance_counts.get(key, [0, 0])
    attendance_pct = round(present / total * 100) if total else None

    timeline = sorted(
        assignment_events.get(key, []) + exam_events.get(key, []),
        key=lambda event: event[1],
        reverse=True,
    )
    trend = None
    if len(timeline) >= 2:
        latest_pct, previous_pct = timeline[0][0], timeline[1][0]
        if latest_pct > previous_pct:
            trend = "up"
        elif latest_pct < previous_pct:
            trend = "down"
        else:
            trend = "stable"

    return {
        "assignment_avg": assignment_avg,
        "exam_avg": exam_avg,
        "attendance_pct": attendance_pct,
        "final_grade": final_grade,
        "trend": trend,
    }


class TeacherGradeSummaryView(APIView):
    """Computed, read-only per-student grade summary for a teacher's own
    groups — NOT backed by a stored model. There is no Grade table; every
    field here is aggregated live from Submission/ExamResult/Attendance,
    closing the gap `groups.models.group_member.GroupMember`'s own
    docstring already flagged (`no final_grade/attendance_rate ... no
    Grades or Attendance backend exists yet to make those real` —
    Attendance has since been built for real; this view is what finally
    makes Grades real too, without adding a table that would just
    duplicate data these three apps already own). See this module's
    top-level comment for the shared business rules.

    `grades:view` is also granted to `student` (see
    StudentGradeSummaryView below) — each view narrows to its own caller's
    data independently (teacher-owns-group here, student-owns-enrollment
    there), same "one permission, two object-scoped views" shape as
    `finance:view` on Invoice/Payment.
    """

    permission_classes = [HasModulePermission]
    required_permission = ("grades", "view")

    def get(self, request):
        teacher_profile = getattr(request.user, "teacher_profile", None)
        if teacher_profile is None:
            # A student's grades:view grant reaches this same permission
            # check but has no teacher_profile — not an error, just nothing
            # for THIS view to return (see StudentGradeSummaryView for their
            # actual endpoint).
            return Response({"success": True, "message": "", "data": []})

        groups = Group.objects.filter(teacher=teacher_profile)
        requested_group = request.query_params.get("group")
        if requested_group:
            # No explicit ownership error for a group outside `groups` —
            # it just filters down to nothing, same as every other
            # teacher-scoped list endpoint in this codebase when asked
            # about a group it doesn't teach.
            groups = groups.filter(id=requested_group)
        group_ids = list(groups.values_list("id", flat=True))
        if not group_ids:
            return Response({"success": True, "message": "", "data": []})

        memberships = list(
            GroupMember.objects.filter(group_id__in=group_ids, status="active")
            .select_related("student_profile__user", "group")
            .order_by("group__name", "student_profile__user__first_name")
        )
        student_ids = list({m.student_profile_id for m in memberships})
        assignment_events, exam_events, attendance_counts = _gather_events(group_ids, student_ids)

        data = []
        for member in memberships:
            key = (member.student_profile_id, member.group_id)
            data.append(
                {
                    "id": f"{member.group_id}:{member.student_profile_id}",
                    "group": str(member.group_id),
                    "group_name": member.group.name,
                    "student_profile": str(member.student_profile_id),
                    "student_name": member.student_profile.user.get_full_name(),
                    **_stats_for_key(key, assignment_events, exam_events, attendance_counts),
                }
            )

        return Response({"success": True, "message": "", "data": data})


class StudentGradeSummaryView(APIView):
    """Computed, read-only grade summary for the caller's OWN enrollments —
    the student-facing counterpart to TeacherGradeSummaryView above (same
    module, same shared aggregation helpers, same business rules — see this
    module's top-level comment). One row per group the student is actively
    enrolled in, since final_grade/attendance are inherently per-group (a
    student's Algebra grade and Biology grade don't average together).
    """

    permission_classes = [HasModulePermission]
    required_permission = ("grades", "view")

    def get(self, request):
        student_profile = getattr(request.user, "student_profile", None)
        if student_profile is None:
            # A teacher's grades:view grant reaches this same permission
            # check but has no student_profile — see TeacherGradeSummaryView
            # for their actual endpoint.
            return Response({"success": True, "message": "", "data": []})

        memberships = list(
            GroupMember.objects.filter(student_profile=student_profile, status="active")
            .select_related("group__course", "group__teacher__user")
            .order_by("group__name")
        )
        group_ids = [m.group_id for m in memberships]
        if not group_ids:
            return Response({"success": True, "message": "", "data": []})

        assignment_events, exam_events, attendance_counts = _gather_events(group_ids, [student_profile.id])

        data = []
        for member in memberships:
            key = (student_profile.id, member.group_id)
            data.append(
                {
                    "id": f"{member.group_id}:{student_profile.id}",
                    "group": str(member.group_id),
                    "group_name": member.group.name,
                    "subject": member.group.course.name,
                    "teacher_name": member.group.teacher.user.get_full_name(),
                    **_stats_for_key(key, assignment_events, exam_events, attendance_counts),
                }
            )

        return Response({"success": True, "message": "", "data": data})
