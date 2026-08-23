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

Score-normalization/grade-averaging/attendance-rate math is centralized in
the `_normalized_scores`/`_mean_pct`/`_combined_grade`/`_attendance_counts`
helpers below and reused by every view that needs it — these don't reuse
`grades/views.py`'s own `_gather_events`/`_stats_for_key` because those are
shaped for a different aggregation (per (student, group) pair, for a
per-group breakdown); these are shaped for "roll up across every group a
student/teacher touches", which is what StudentsSummaryReportView/
TeachersSummaryReportView both need. Keeping one shared copy in this
module (instead of the original 5+ independent copies) means the grading/
attendance rule only has one place to drift out of sync from grades.py's,
not five.
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db.models import DecimalField, F, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce
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


def _normalized_scores(rows, id_field, score_field, max_field):
    """`rows`: an iterable of dicts from a `.values(...)` queryset. Groups
    score-as-%-of-max by `id_field`, dropping any row whose max is <= 0 —
    the one normalize-before-averaging rule (matches grades/views.py's
    identical rule) every score-averaging computation in this module
    shares, so it can't drift between the Students/Teachers report rows.
    """
    result = defaultdict(list)
    for row in rows:
        max_score = row[max_field] or 0
        if max_score > 0:
            result[row[id_field]].append(row[score_field] / max_score * 100)
    return result


def _mean_pct(values):
    return round(sum(values) / len(values)) if values else None


def _combined_grade(assignment_pcts, exam_pcts):
    """Mean of whichever of (assignment avg, exam avg) exist — never
    dragged toward 0 by a missing half. Same rule as grades/views.py's
    `final_grade`. Returns (assignment_avg, exam_avg, combined)."""
    assignment_avg = _mean_pct(assignment_pcts)
    exam_avg = _mean_pct(exam_pcts)
    components = [v for v in (assignment_avg, exam_avg) if v is not None]
    return assignment_avg, exam_avg, (_mean_pct(components) if components else None)


def _attendance_counts(rows, id_field):
    """`rows`: an iterable of dicts with `status` and `id_field`. Returns
    `{id: [present, total]}` — only "present" counts as attended, same
    rule as grades/views.py."""
    counts = defaultdict(lambda: [0, 0])
    for row in rows:
        counts[row[id_field]][1] += 1
        if row["status"] == "present":
            counts[row[id_field]][0] += 1
    return counts


class StudentsSummaryReportView(APIView):
    """One row per student enrolled at some point during the period: attendance/
    homework/grade performance for the given period, rolled up across every
    group they were an active member of — an org-level report, not the
    Teacher/Student Grades page's per-group breakdown (see `grades/views.py`,
    which this deliberately does not duplicate: that view answers "how is
    this student doing in THIS group", this one answers "how is this
    student doing overall this period").

    The roster is scoped by `enrollment_date`/`graduation_date` overlapping
    the requested period, not by the student's CURRENT status — a student
    who graduated after the period ended must still show up in a report
    for that period. This doesn't (and can't, with the fields this model
    has) catch every terminal status the same way — `expelled`/
    `transferred`/`on_leave` have no matching "left the org on this date"
    field, only `graduation_date` — but it fixes the concrete case (a
    graduated student vanishing from their own past reports) without
    fabricating a field the model doesn't have.

    `average_grade` follows the exact same rule as `grades`'s
    `final_grade`: the mean of whichever of (assignment_avg, exam_avg)
    actually have data, never dragged toward 0 by a missing half.
    """

    permission_classes = [HasModulePermission]
    required_permission = REPORTS_REQUIRED_PERMISSION

    def get(self, request):
        start, end = _resolve_period(request)
        branch = request.query_params.get("branch")

        students = StudentProfile.objects.filter(enrollment_date__lte=end).filter(
            Q(graduation_date__isnull=True) | Q(graduation_date__gte=start)
        ).select_related("user")
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

        # Scored by the assignment's/exam's OWN date (due_date / date), not
        # by when it happened to be graded — matches homeworks_total's
        # due_date window below, and keeps group_id__in=all_group_ids so a
        # group the student has since left (GroupMember no longer "active")
        # doesn't keep contributing attendance/grade data that
        # homeworks_total, scoped the same way, already excludes.
        assignment_scores = _normalized_scores(
            Submission.objects.filter(
                student_profile_id__in=student_ids,
                assignment__group_id__in=all_group_ids,
                assignment__due_date__gte=start,
                assignment__due_date__lte=end,
                score__isnull=False,
            ).values("student_profile_id", "score", "assignment__max_score"),
            "student_profile_id",
            "score",
            "assignment__max_score",
        )
        exam_scores = _normalized_scores(
            ExamResult.objects.filter(
                student_profile_id__in=student_ids,
                exam__group_id__in=all_group_ids,
                exam__date__gte=start,
                exam__date__lte=end,
                score__isnull=False,
            ).values("student_profile_id", "score", "exam__max_score"),
            "student_profile_id",
            "score",
            "exam__max_score",
        )
        attendance_counts = _attendance_counts(
            Attendance.objects.filter(
                student_profile_id__in=student_ids, group_id__in=all_group_ids, date__gte=start, date__lte=end
            ).values("student_profile_id", "status"),
            "student_profile_id",
        )

        data = []
        for student in students:
            assignment_avg, exam_avg, average_grade = _combined_grade(
                assignment_scores.get(student.id, []), exam_scores.get(student.id, [])
            )

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
    """One row per teacher employed at some point during the period: workload
    and their students' performance for the given period, rolled up across
    every group they taught during it.

    Both the teacher roster (`hire_date`/`termination_date` overlap) and
    each teacher's groups (`start_date`/`end_date` overlap) are scoped by
    the requested period, not by CURRENT status — a teacher's July report
    must still include a group that was marked "completed" in August, and
    a terminated teacher must still show up in a report for while they
    were employed. See StudentsSummaryReportView's docstring for the same
    reasoning (and the same "no field for every terminal status" caveat).
    """

    permission_classes = [HasModulePermission]
    required_permission = REPORTS_REQUIRED_PERMISSION

    def get(self, request):
        start, end = _resolve_period(request)
        branch = request.query_params.get("branch")

        teachers = TeacherProfile.objects.filter(hire_date__lte=end).filter(
            Q(termination_date__isnull=True) | Q(termination_date__gte=start)
        ).select_related("user")
        if branch:
            teachers = teachers.filter(branch_id=branch)
        teachers = list(teachers.order_by("user__first_name", "user__last_name"))
        teacher_ids = [t.id for t in teachers]
        if not teacher_ids:
            return Response({"success": True, "message": "", "data": []})

        groups_by_teacher = defaultdict(list)
        for row in (
            Group.objects.filter(teacher_id__in=teacher_ids, start_date__lte=end)
            .filter(Q(end_date__isnull=True) | Q(end_date__gte=start))
            .values("id", "teacher_id")
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

        attendance_by_group = _attendance_counts(
            Attendance.objects.filter(group_id__in=all_group_ids, date__gte=start, date__lte=end).values(
                "group_id", "status"
            ),
            "group_id",
        )

        assignment_counts_by_group = defaultdict(int)
        for row in Assignment.objects.filter(group_id__in=all_group_ids, due_date__gte=start, due_date__lte=end).values(
            "id", "group_id"
        ):
            assignment_counts_by_group[row["group_id"]] += 1

        # One query (not two overlapping ones) for both homework_graded and
        # the assignment half of scores_by_group — same due_date window as
        # assignment_counts_by_group above (not graded_at: a June-due
        # assignment graded in August must not count as August's work,
        # the same fix as StudentsSummaryReportView's assignment_scores).
        graded_counts_by_group = defaultdict(int)
        scores_by_group = defaultdict(list)
        for row in Submission.objects.filter(
            assignment__group_id__in=all_group_ids,
            assignment__due_date__gte=start,
            assignment__due_date__lte=end,
            score__isnull=False,
        ).values("assignment__group_id", "score", "assignment__max_score"):
            gid = row["assignment__group_id"]
            graded_counts_by_group[gid] += 1
            max_score = row["assignment__max_score"] or 0
            if max_score > 0:
                scores_by_group[gid].append(row["score"] / max_score * 100)

        for row in ExamResult.objects.filter(
            exam__group_id__in=all_group_ids,
            exam__date__gte=start,
            exam__date__lte=end,
            score__isnull=False,
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

            average_student_grade = _mean_pct([pct for gid in group_ids for pct in scores_by_group.get(gid, ())])

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

    That snapshot is computed entirely in the database: a correlated
    subquery for payments-to-date per invoice, then one conditional-
    aggregate query for both totals — not a Python loop materializing
    every open invoice in the org on every page load (including every
    date-picker edit, since start/end always re-fire this view).
    """

    permission_classes = [HasModulePermission]
    required_permission = REPORTS_REQUIRED_PERMISSION

    def get(self, request):
        start, end = _resolve_period(request)

        total_invoiced = (
            Invoice.objects.filter(issued_date__gte=start, issued_date__lte=end)
            .exclude(status="cancelled")
            .aggregate(total=Coalesce(Sum("total_amount"), Decimal("0")))["total"]
        )
        total_collected = (
            Payment.objects.filter(payment_date__gte=start, payment_date__lte=end)
            .aggregate(total=Coalesce(Sum("amount"), Decimal("0")))["total"]
        )

        paid_to_date = (
            Payment.objects.filter(invoice_id=OuterRef("pk"), payment_date__lte=end)
            .order_by()
            .values("invoice_id")
            .annotate(total=Sum("amount"))
            .values("total")
        )
        open_invoices = (
            Invoice.objects.filter(issued_date__lte=end)
            .exclude(status__in=["cancelled", "draft"])
            .annotate(
                paid=Coalesce(
                    Subquery(paid_to_date, output_field=DecimalField(max_digits=12, decimal_places=2)),
                    Decimal("0"),
                ),
                balance=F("total_amount") - F("paid"),
            )
            .filter(balance__gt=0)
        )
        balance_totals = open_invoices.aggregate(
            total_outstanding=Coalesce(Sum("balance"), Decimal("0")),
            total_overdue=Coalesce(Sum("balance", filter=Q(due_date__lt=end)), Decimal("0")),
        )

        new_enrollments = StudentProfile.objects.filter(enrollment_date__gte=start, enrollment_date__lte=end).count()

        data = {
            "period_start": start.isoformat(),
            "period_end": end.isoformat(),
            "total_invoiced": total_invoiced,
            "total_collected": total_collected,
            "total_outstanding": balance_totals["total_outstanding"],
            "total_overdue": balance_totals["total_overdue"],
            "new_enrollments": new_enrollments,
            "currency": "UZS",
        }
        return Response({"success": True, "message": "", "data": data})
