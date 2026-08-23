"""Org-wide reporting endpoints for the Admin portal's Reports page.

Computed, not stored — same call as `grades` (see
`foundation/permissions_catalog.py`'s "grades" docstring note and
`grades/views.py`'s module comment): `database/14-reports-ai.sql` defines
`report.student_reports`/`teacher_reports`/`attendance_reports`/
`finance_reports` as pre-generated snapshot tables refreshed by a scheduled
job, but no task queue/cron exists anywhere in this backend yet, and every
reporting-style surface actually shipped so far (Super-Admin Dashboard,
Super-Admin Reports, the Admin Finance revenue chart, `grades` itself)
aggregates live from the real tables instead. Adding four more cached
tables nothing would ever refresh would just mean permanently-stale data
behind a `refresh_reports` command nobody calls — so this follows the
proven pattern instead: four read-only views, aggregated on each request
from Attendance/Submission/ExamResult/Assignment/Lesson/Invoice/Payment,
scoped to the caller's own organization by RLS (see
`common/middleware.py::OrganizationContextMiddleware`) the same way every
other view in this codebase relies on it rather than filtering
`organization=` explicitly.

All four are `reports:view`, center_admin-only — org-wide aggregates across
every student/teacher/invoice in the org, same "no other role gets even
:view" precedent as `finance`/`audit_logs`/`teacher_salary` (see those
modules' notes in permissions_catalog.py).
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from attendance.models import Attendance
from common.permissions import HasModulePermission
from exams.models import ExamResult
from finance.models import Invoice, Payment
from groups.models import Group, GroupMember
from homework.models import Assignment, Submission
from schedule.models import Lesson
from student.models import StudentProfile
from teacher.models import TeacherProfile

REPORTS_REQUIRED_PERMISSION = ("reports", "view")


def _resolve_period(request):
    """`start`/`end` query params (YYYY-MM-DD), defaulting to the 1st of
    the current month through today. A real, always-applied default rather
    than an unwired selector — see the Super-Admin Reports page's own
    period selector, which got removed for never actually filtering
    anything (commit ca97963); every param here always changes the query.
    Invalid/missing values fall back to the default instead of erroring —
    this is a reporting view, not a form submission.
    """
    today = timezone.localdate()
    start_param = request.query_params.get("start")
    end_param = request.query_params.get("end")
    try:
        start = date.fromisoformat(start_param) if start_param else today.replace(day=1)
    except ValueError:
        start = today.replace(day=1)
    try:
        end = date.fromisoformat(end_param) if end_param else today
    except ValueError:
        end = today
    if end < start:
        start, end = end, start
    return start, end


class StudentsSummaryReportView(APIView):
    """One row per active student in the org: attendance/homework/grade
    performance for the given period, rolled up across ALL of that
    student's active group memberships combined — an org-level report, not
    the Teacher/Student Grades page's per-group breakdown (see
    `grades/views.py`, which this deliberately does not duplicate: that
    view answers "how is this student doing in THIS group", this one
    answers "how is this student doing overall this month").

    `average_grade` follows the exact same rule as `grades`'s
    `final_grade`: the mean of whichever of (assignment_avg, exam_avg)
    actually have data, never dragged toward 0 by a missing half.
    """

    permission_classes = [HasModulePermission]
    required_permission = REPORTS_REQUIRED_PERMISSION

    def get(self, request):
        start, end = _resolve_period(request)
        branch = request.query_params.get("branch")

        students = StudentProfile.objects.filter(status="active").select_related("user")
        if branch:
            students = students.filter(branch_id=branch)
        students = list(students.order_by("user__first_name", "user__last_name"))
        student_ids = [s.id for s in students]
        if not student_ids:
            return Response({"success": True, "message": "", "data": []})

        groups_by_student = defaultdict(set)
        for row in GroupMember.objects.filter(student_profile_id__in=student_ids, status="active").values(
            "student_profile_id", "group_id"
        ):
            groups_by_student[row["student_profile_id"]].add(row["group_id"])
        all_group_ids = {gid for gids in groups_by_student.values() for gid in gids}

        assignment_ids_by_group = defaultdict(set)
        for row in Assignment.objects.filter(group_id__in=all_group_ids, due_date__gte=start, due_date__lte=end).values(
            "id", "group_id"
        ):
            assignment_ids_by_group[row["group_id"]].add(row["id"])
        all_assignment_ids = {aid for ids in assignment_ids_by_group.values() for aid in ids}

        submitted_ids_by_student = defaultdict(set)
        for row in Submission.objects.filter(
            student_profile_id__in=student_ids, assignment_id__in=all_assignment_ids
        ).values("student_profile_id", "assignment_id"):
            submitted_ids_by_student[row["student_profile_id"]].add(row["assignment_id"])

        assignment_scores = defaultdict(list)
        for row in Submission.objects.filter(
            student_profile_id__in=student_ids,
            score__isnull=False,
            graded_at__date__gte=start,
            graded_at__date__lte=end,
        ).values("student_profile_id", "score", "assignment__max_score"):
            max_score = row["assignment__max_score"] or 0
            if max_score > 0:
                assignment_scores[row["student_profile_id"]].append(row["score"] / max_score * 100)

        exam_scores = defaultdict(list)
        for row in ExamResult.objects.filter(
            student_profile_id__in=student_ids,
            score__isnull=False,
            graded_at__date__gte=start,
            graded_at__date__lte=end,
        ).values("student_profile_id", "score", "exam__max_score"):
            max_score = row["exam__max_score"] or 0
            if max_score > 0:
                exam_scores[row["student_profile_id"]].append(row["score"] / max_score * 100)

        attendance_counts = defaultdict(lambda: [0, 0])  # [present, total]
        for row in Attendance.objects.filter(
            student_profile_id__in=student_ids, date__gte=start, date__lte=end
        ).values("student_profile_id", "status"):
            attendance_counts[row["student_profile_id"]][1] += 1
            if row["status"] == "present":
                attendance_counts[row["student_profile_id"]][0] += 1

        data = []
        for student in students:
            a_scores = assignment_scores.get(student.id, [])
            e_scores = exam_scores.get(student.id, [])
            assignment_avg = round(sum(a_scores) / len(a_scores)) if a_scores else None
            exam_avg = round(sum(e_scores) / len(e_scores)) if e_scores else None
            components = [v for v in (assignment_avg, exam_avg) if v is not None]
            average_grade = round(sum(components) / len(components)) if components else None

            present, total = attendance_counts.get(student.id, [0, 0])
            attendance_rate = round(present / total * 100) if total else None

            student_assignment_ids = {
                aid for gid in groups_by_student.get(student.id, ()) for aid in assignment_ids_by_group.get(gid, ())
            }
            homeworks_total = len(student_assignment_ids)
            homeworks_submitted = len(submitted_ids_by_student.get(student.id, set()) & student_assignment_ids)
            homework_completion_rate = round(homeworks_submitted / homeworks_total * 100) if homeworks_total else None

            data.append(
                {
                    "id": str(student.id),
                    "student_name": student.user.get_full_name(),
                    "student_code": student.student_code,
                    "attendance_rate": attendance_rate,
                    "lessons_attended": present,
                    "lessons_total": total,
                    "homework_completion_rate": homework_completion_rate,
                    "homeworks_submitted": homeworks_submitted,
                    "homeworks_total": homeworks_total,
                    "average_grade": average_grade,
                    "exam_average": exam_avg,
                }
            )

        return Response({"success": True, "message": "", "data": data})


class TeachersSummaryReportView(APIView):
    """One row per active teacher in the org: workload and their students'
    performance for the given period, rolled up across every group they
    teach.
    """

    permission_classes = [HasModulePermission]
    required_permission = REPORTS_REQUIRED_PERMISSION

    def get(self, request):
        start, end = _resolve_period(request)
        branch = request.query_params.get("branch")

        teachers = TeacherProfile.objects.filter(status="active").select_related("user")
        if branch:
            teachers = teachers.filter(branch_id=branch)
        teachers = list(teachers.order_by("user__first_name", "user__last_name"))
        teacher_ids = [t.id for t in teachers]
        if not teacher_ids:
            return Response({"success": True, "message": "", "data": []})

        groups_by_teacher = defaultdict(list)
        for row in Group.objects.filter(teacher_id__in=teacher_ids, status__in=["forming", "active"]).values(
            "id", "teacher_id"
        ):
            groups_by_teacher[row["teacher_id"]].append(row["id"])
        all_group_ids = [gid for ids in groups_by_teacher.values() for gid in ids]

        lessons_taught = defaultdict(int)
        lessons_cancelled = defaultdict(int)
        for row in Lesson.objects.filter(group_id__in=all_group_ids, date__gte=start, date__lte=end).values(
            "group__teacher_id", "status"
        ):
            if row["status"] == "completed":
                lessons_taught[row["group__teacher_id"]] += 1
            elif row["status"] == "cancelled":
                lessons_cancelled[row["group__teacher_id"]] += 1

        members_by_group = defaultdict(set)
        for row in GroupMember.objects.filter(group_id__in=all_group_ids, status="active").values(
            "group_id", "student_profile_id"
        ):
            members_by_group[row["group_id"]].add(row["student_profile_id"])

        attendance_by_group = defaultdict(lambda: [0, 0])  # [present, total]
        for row in Attendance.objects.filter(group_id__in=all_group_ids, date__gte=start, date__lte=end).values(
            "group_id", "status"
        ):
            attendance_by_group[row["group_id"]][1] += 1
            if row["status"] == "present":
                attendance_by_group[row["group_id"]][0] += 1

        assignment_counts_by_group = defaultdict(int)
        assignment_ids_by_group = defaultdict(set)
        for row in Assignment.objects.filter(group_id__in=all_group_ids, due_date__gte=start, due_date__lte=end).values(
            "id", "group_id"
        ):
            assignment_counts_by_group[row["group_id"]] += 1
            assignment_ids_by_group[row["group_id"]].add(row["id"])
        all_assignment_ids = {aid for ids in assignment_ids_by_group.values() for aid in ids}

        graded_counts_by_group = defaultdict(int)
        for row in Submission.objects.filter(
            assignment_id__in=all_assignment_ids,
            score__isnull=False,
            graded_at__date__gte=start,
            graded_at__date__lte=end,
        ).values("assignment__group_id"):
            graded_counts_by_group[row["assignment__group_id"]] += 1

        # Combined assignment+exam score-as-percentage-of-max, per group —
        # same normalize-before-averaging rule as grades/views.py.
        scores_by_group = defaultdict(list)
        for row in Submission.objects.filter(
            assignment__group_id__in=all_group_ids,
            score__isnull=False,
            graded_at__date__gte=start,
            graded_at__date__lte=end,
        ).values("assignment__group_id", "score", "assignment__max_score"):
            max_score = row["assignment__max_score"] or 0
            if max_score > 0:
                scores_by_group[row["assignment__group_id"]].append(row["score"] / max_score * 100)
        for row in ExamResult.objects.filter(
            exam__group_id__in=all_group_ids,
            score__isnull=False,
            graded_at__date__gte=start,
            graded_at__date__lte=end,
        ).values("exam__group_id", "score", "exam__max_score"):
            max_score = row["exam__max_score"] or 0
            if max_score > 0:
                scores_by_group[row["exam__group_id"]].append(row["score"] / max_score * 100)

        data = []
        for teacher in teachers:
            group_ids = groups_by_teacher.get(teacher.id, [])
            total_students = len({sid for gid in group_ids for sid in members_by_group.get(gid, ())})

            present_sum = sum(attendance_by_group.get(gid, [0, 0])[0] for gid in group_ids)
            total_sum = sum(attendance_by_group.get(gid, [0, 0])[1] for gid in group_ids)
            average_attendance_rate = round(present_sum / total_sum * 100) if total_sum else None

            scores = [pct for gid in group_ids for pct in scores_by_group.get(gid, ())]
            average_student_grade = round(sum(scores) / len(scores)) if scores else None

            data.append(
                {
                    "id": str(teacher.id),
                    "teacher_name": teacher.user.get_full_name(),
                    "teacher_code": teacher.teacher_code,
                    "groups_count": len(group_ids),
                    "lessons_taught": lessons_taught.get(teacher.id, 0),
                    "lessons_cancelled": lessons_cancelled.get(teacher.id, 0),
                    "total_students": total_students,
                    "average_attendance_rate": average_attendance_rate,
                    "average_student_grade": average_student_grade,
                    "homework_assigned": sum(assignment_counts_by_group.get(gid, 0) for gid in group_ids),
                    "homework_graded": sum(graded_counts_by_group.get(gid, 0) for gid in group_ids),
                }
            )

        return Response({"success": True, "message": "", "data": data})


class AttendanceSummaryReportView(APIView):
    """Org-wide (optionally branch- or group-filtered) attendance rollup
    for the given period, plus an at-risk list (active students whose own
    attendance rate in the period is below 70%) — the one card the
    Super-Admin Reports page dropped for having no real per-org query path
    (commit ca97963); this view has one, since it's already org-scoped by
    RLS instead of iterating every organization.
    """

    permission_classes = [HasModulePermission]
    required_permission = REPORTS_REQUIRED_PERMISSION

    AT_RISK_THRESHOLD = 70

    def get(self, request):
        start, end = _resolve_period(request)
        branch = request.query_params.get("branch")
        group_param = request.query_params.get("group")

        qs = Attendance.objects.filter(date__gte=start, date__lte=end)
        if group_param:
            qs = qs.filter(group_id=group_param)
        if branch:
            qs = qs.filter(group__branch_id=branch)

        status_counts = defaultdict(int)
        per_student = defaultdict(lambda: [0, 0])  # [present, total]
        lesson_days = set()
        for row in qs.values("student_profile_id", "group_id", "date", "status"):
            status_counts[row["status"]] += 1
            per_student[row["student_profile_id"]][1] += 1
            if row["status"] == "present":
                per_student[row["student_profile_id"]][0] += 1
            lesson_days.add((row["group_id"], row["date"]))

        total_records = sum(status_counts.values())
        average_attendance_rate = round(status_counts.get("present", 0) / total_records * 100) if total_records else None

        at_risk_ids = [sid for sid, (present, total) in per_student.items() if total and present / total * 100 < self.AT_RISK_THRESHOLD]
        students_by_id = {
            s.id: s for s in StudentProfile.objects.filter(id__in=at_risk_ids).select_related("user")
        }
        at_risk = sorted(
            (
                {
                    "student_profile": str(sid),
                    "student_name": students_by_id[sid].user.get_full_name(),
                    "attendance_rate": round(per_student[sid][0] / per_student[sid][1] * 100),
                }
                for sid in at_risk_ids
                if sid in students_by_id
            ),
            key=lambda row: row["attendance_rate"],
        )

        data = {
            "period_start": start.isoformat(),
            "period_end": end.isoformat(),
            "total_lessons": len(lesson_days),
            "total_students": len(per_student),
            "average_attendance_rate": average_attendance_rate,
            "present_count": status_counts.get("present", 0),
            "absent_count": status_counts.get("absent", 0),
            "late_count": status_counts.get("late", 0),
            "excused_count": status_counts.get("excused", 0),
            "early_leave_count": status_counts.get("early_leave", 0),
            "sick_count": status_counts.get("sick", 0),
            "at_risk_students": at_risk[:20],
        }
        return Response({"success": True, "message": "", "data": data})


class FinanceSummaryReportView(APIView):
    """Org-wide financial summary for the given period.

    No `total_expenses`/`net_profit`/`payroll_total` fields — the same
    "no expense data exists anywhere in this backend" reality the Admin
    Finance revenue chart already dropped its Expenses bar for (commit
    9f074c2): `finance` never got Expense/Payroll models (trimmed from
    `database/12-finance.sql`, see `finance/models/invoice.py`'s
    docstring), so those fields would just be fabricated zeros. Add them
    here if those models ever exist.

    `total_outstanding`/`total_overdue` are snapshot balances as of `end`
    (every still-open invoice issued on or before `end`, minus payments
    made on or before `end`) — not flow-in-period like
    `total_invoiced`/`total_collected`, which only count invoices/payments
    dated inside [start, end]. A debt doesn't stop being outstanding just
    because it was invoiced last month.
    """

    permission_classes = [HasModulePermission]
    required_permission = REPORTS_REQUIRED_PERMISSION

    def get(self, request):
        start, end = _resolve_period(request)

        total_invoiced = (
            Invoice.objects.filter(issued_date__gte=start, issued_date__lte=end)
            .exclude(status="cancelled")
            .aggregate(total=Sum("total_amount"))["total"]
            or Decimal("0")
        )
        total_collected = (
            Payment.objects.filter(payment_date__gte=start, payment_date__lte=end).aggregate(total=Sum("amount"))["total"]
            or Decimal("0")
        )

        open_invoices = list(
            Invoice.objects.filter(issued_date__lte=end)
            .exclude(status__in=["cancelled", "draft"])
            .only("id", "total_amount", "due_date")
        )
        paid_by_invoice = defaultdict(lambda: Decimal("0"))
        for row in (
            Payment.objects.filter(invoice_id__in=[inv.id for inv in open_invoices], payment_date__lte=end)
            .values("invoice_id")
            .annotate(total=Sum("amount"))
        ):
            paid_by_invoice[row["invoice_id"]] = row["total"] or Decimal("0")

        total_outstanding = Decimal("0")
        total_overdue = Decimal("0")
        for invoice in open_invoices:
            balance = invoice.total_amount - paid_by_invoice.get(invoice.id, Decimal("0"))
            if balance <= 0:
                continue
            total_outstanding += balance
            if invoice.due_date < end:
                total_overdue += balance

        new_enrollments = StudentProfile.objects.filter(enrollment_date__gte=start, enrollment_date__lte=end).count()

        data = {
            "period_start": start.isoformat(),
            "period_end": end.isoformat(),
            "total_invoiced": total_invoiced,
            "total_collected": total_collected,
            "total_outstanding": total_outstanding,
            "total_overdue": total_overdue,
            "new_enrollments": new_enrollments,
            "currency": "UZS",
        }
        return Response({"success": True, "message": "", "data": data})
