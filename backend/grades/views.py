from collections import defaultdict

from rest_framework.response import Response
from rest_framework.views import APIView

from attendance.models import Attendance
from common.permissions import HasModulePermission
from exams.models import ExamResult
from groups.models import Group, GroupMember
from homework.models import Submission


class TeacherGradeSummaryView(APIView):
    """Computed, read-only per-student grade summary for a teacher's own
    groups — NOT backed by a stored model. There is no Grade table; every
    field here is aggregated live from Submission/ExamResult/Attendance,
    closing the gap `groups.models.group_member.GroupMember`'s own
    docstring already flagged (`no final_grade/attendance_rate ... no
    Grades or Attendance backend exists yet to make those real` —
    Attendance has since been built for real; this view is what finally
    makes Grades real too, without adding a table that would just
    duplicate data these three apps already own).

    Scope: teacher-only for now (see foundation.permissions_catalog's
    "grades" note) — a center_admin/student-facing version of this is a
    separate, not-yet-built surface, so `grades:view` is only granted to
    the `teacher` role.

    Business rules confirmed with the product owner (not invented here):
    - `assignment_avg`/`exam_avg` are the mean of each graded Submission's/
      ExamResult's score-as-a-percentage-of-that-item's-own-max_score
      (items don't all share one point scale, so this normalizes before
      averaging — same reasoning as the Admin Exams page's
      avgScoreAcrossCompleted).
    - `attendance_pct` counts ONLY the "present" status as attended;
      late/excused/early_leave/sick/absent all count as not-present.
    - `final_grade` is the mean of whichever of assignment_avg/exam_avg
      actually exist — never a value silently dragged toward 0 by a
      missing half. `None` ("no data yet") only when neither exists.
      Attendance is its own column, deliberately not folded into this.
    - No letter grade — not asked for, not computed.
    - `trend` compares the 2 most recently graded events (Submission +
      ExamResult combined, by `graded_at`) for that student in that group;
      `None` until at least 2 exist.
    """

    permission_classes = [HasModulePermission]
    required_permission = ("grades", "view")

    def get(self, request):
        teacher_profile = getattr(request.user, "teacher_profile", None)
        if teacher_profile is None:
            # Defensive, not expected in practice — only `teacher` role
            # ever holds grades:view (see class docstring), so a caller
            # without a teacher_profile shouldn't reach here at all.
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

        # (student_id, group_id) -> [(score_pct, graded_at), ...]
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

        # (student_id, group_id) -> [present_count, total_count]
        attendance_counts = defaultdict(lambda: [0, 0])
        for row in Attendance.objects.filter(
            group_id__in=group_ids, student_profile_id__in=student_ids
        ).values("student_profile_id", "group_id", "status"):
            key = (row["student_profile_id"], row["group_id"])
            attendance_counts[key][1] += 1
            if row["status"] == "present":
                attendance_counts[key][0] += 1

        data = []
        for member in memberships:
            key = (member.student_profile_id, member.group_id)
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

            data.append(
                {
                    "id": f"{member.group_id}:{member.student_profile_id}",
                    "group": str(member.group_id),
                    "group_name": member.group.name,
                    "student_profile": str(member.student_profile_id),
                    "student_name": member.student_profile.user.get_full_name(),
                    "assignment_avg": assignment_avg,
                    "exam_avg": exam_avg,
                    "attendance_pct": attendance_pct,
                    "final_grade": final_grade,
                    "trend": trend,
                }
            )

        return Response({"success": True, "message": "", "data": data})
