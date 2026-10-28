"""Per-Group monthly payment roster — who in each Group has paid a given
month and who hasn't. Backs the Admin Finance page's group view
(finance.views.GroupBillingViewSet): a student says "I'm in English B1", the
admin opens that Group, finds them and records the payment.

Nothing here is stored: a roster row is derived from what says a student
owes a Group for a month —
  * the month's invoices for that Group: the monthly-billing one
    (`billing_period` = the month) and any one-off invoice an admin raised
    by hand against that Group with its due date inside the month (those
    have no `billing_period`, but they are that student's bill for the
    month all the same), and
  * an active GroupMember of a running Group — owes the monthly fee even
    while no invoice exists yet (a mid-month joiner the admin chose not to
    bill, a Group whose price was set after the monthly run).
Their union, keyed by (group, student), is the roster. A row with invoices
is judged by those invoices' totals; only an un-invoiced row falls back to
the Group's monthly price.

Every query runs on the request's default connection, so RLS keeps it inside
the caller's organization like any other finance read.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db.models import DecimalField, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from finance.models import Invoice, Payment
from finance.services import (
    NOT_BILLING_STATUSES,
    billing_due_date,
    group_monthly_price,
    month_end,
    month_invoice_q,
)
from groups.models import Group, GroupMember
from student.models import StudentProfile

RUNNING_GROUP_STATUSES = ("forming", "active")

ROW_PAID = "paid"
ROW_PARTIAL = "partially_paid"
ROW_UNPAID = "unpaid"

ZERO = Decimal("0")


@dataclass
class RosterInvoice:
    id: str
    total_amount: Decimal
    paid_amount: Decimal
    due_date: date

    @property
    def balance(self) -> Decimal:
        return self.total_amount - self.paid_amount


@dataclass
class RosterRow:
    group_id: str
    student_profile_id: str
    invoices: list[RosterInvoice] = field(default_factory=list)
    # Only for a row with no invoices: what the monthly invoice would say.
    unbilled_amount: Decimal | None = None
    unbilled_due_date: date | None = None

    @property
    def total_amount(self) -> Decimal | None:
        if self.invoices:
            return sum((i.total_amount for i in self.invoices), ZERO)
        return self.unbilled_amount

    @property
    def paid_amount(self) -> Decimal:
        return sum((i.paid_amount for i in self.invoices), ZERO)

    @property
    def balance(self) -> Decimal | None:
        total = self.total_amount
        return None if total is None else total - self.paid_amount

    @property
    def due_date(self) -> date | None:
        """The earliest due date still owed on — what makes the row overdue."""
        if not self.invoices:
            return self.unbilled_due_date
        open_dates = [i.due_date for i in self.invoices if i.balance > 0]
        return min(open_dates) if open_dates else max(i.due_date for i in self.invoices)

    @property
    def status(self) -> str:
        total = self.total_amount
        if total is not None and self.paid_amount >= total:
            return ROW_PAID
        return ROW_PARTIAL if self.paid_amount > 0 else ROW_UNPAID

    def is_overdue(self, today: date) -> bool:
        return self.status != ROW_PAID and self.due_date is not None and self.due_date < today


def _member_pairs(period: date, group_ids=None) -> set[tuple[str, str]]:
    """Active members of Groups running during `period` who had joined by
    the end of it — the same eligibility issue_monthly_invoices bills,
    minus its mid-month-joiner skip (those still owe the month)."""
    next_start = timezone.make_aware(datetime.combine(month_end(period) + timedelta(days=1), time.min))
    members = (
        GroupMember.objects.filter(
            status="active",
            created_at__lt=next_start,
            group__status__in=RUNNING_GROUP_STATUSES,
            group__deleted_at__isnull=True,
            group__start_date__lte=month_end(period),
            student_profile__deleted_at__isnull=True,
        )
        .exclude(group__end_date__lt=period)
    )
    if group_ids is not None:
        members = members.filter(group_id__in=group_ids)
    return {(str(g), str(s)) for g, s in members.values_list("group_id", "student_profile_id")}


def period_invoices(period: date):
    """The month's live, payable invoices of any Group — monthly-billing and
    hand-made alike (see the module docstring)."""
    return Invoice.objects.filter(month_invoice_q(period), group__isnull=False).exclude(
        status__in=NOT_BILLING_STATUSES
    )


def _period_invoice_rows(period: date, group_ids=None):
    paid = (
        Payment.objects.filter(invoice_id=OuterRef("pk"))
        .order_by()
        .values("invoice_id")
        .annotate(total=Sum("amount"))
        .values("total")
    )
    invoices = period_invoices(period).annotate(
        paid=Coalesce(Subquery(paid, output_field=DecimalField(max_digits=12, decimal_places=2)), ZERO)
    )
    if group_ids is not None:
        invoices = invoices.filter(group_id__in=group_ids)
    return invoices.order_by("due_date", "created_at").values(
        "id", "group_id", "student_profile_id", "total_amount", "paid", "due_date"
    )


def build_roster(period: date, group_ids=None) -> tuple[dict[str, Group], dict[str, list[RosterRow]]]:
    """Returns ({group_id: Group}, {group_id: [RosterRow, ...]}) for every
    Group with at least one row in `period`."""
    rows: dict[tuple[str, str], RosterRow] = {}
    for invoice in _period_invoice_rows(period, group_ids):
        key = (str(invoice["group_id"]), str(invoice["student_profile_id"]))
        row = rows.setdefault(key, RosterRow(group_id=key[0], student_profile_id=key[1]))
        row.invoices.append(RosterInvoice(
            id=str(invoice["id"]), total_amount=invoice["total_amount"], paid_amount=invoice["paid"],
            due_date=invoice["due_date"],
        ))
    for key in _member_pairs(period, group_ids) - rows.keys():
        rows[key] = RosterRow(group_id=key[0], student_profile_id=key[1])

    groups = {
        str(g.id): g
        for g in Group.objects.filter(id__in={r.group_id for r in rows.values()}).select_related(
            "course", "teacher__user"
        )
    }
    by_group: dict[str, list[RosterRow]] = {}
    for row in rows.values():
        group = groups.get(row.group_id)
        if group is None:  # soft-deleted Group with a leftover invoice
            continue
        if not row.invoices:
            row.unbilled_amount = group_monthly_price(group)
            row.unbilled_due_date = billing_due_date(group, period)
        by_group.setdefault(row.group_id, []).append(row)
    return {gid: groups[gid] for gid in by_group}, by_group


def matching_student_ids(search: str) -> set[str]:
    students = StudentProfile.objects.all()
    for term in search.split():
        students = students.filter(
            Q(user__first_name__icontains=term) | Q(user__last_name__icontains=term) | Q(user__login_id__icontains=term)
        )
    return {str(pk) for pk in students.values_list("id", flat=True)}


def group_summary(group: Group, rows: list[RosterRow], today: date) -> dict:
    teacher_user = group.teacher.user if group.teacher_id else None
    return {
        "id": str(group.id),
        "name": group.name,
        "code": group.code,
        "course_name": group.course.name,
        "teacher_name": teacher_user.get_full_name() if teacher_user else None,
        "monthly_price": group_monthly_price(group),
        "currency": group.currency,
        "billing_day": group.billing_day,
        "student_count": len(rows),
        "paid_count": sum(r.status == ROW_PAID for r in rows),
        "partially_paid_count": sum(r.status == ROW_PARTIAL for r in rows),
        "unpaid_count": sum(r.status == ROW_UNPAID for r in rows),
        "overdue_count": sum(r.is_overdue(today) for r in rows),
        "expected_amount": sum((r.total_amount or ZERO for r in rows), ZERO),
        "collected_amount": sum((r.paid_amount for r in rows), ZERO),
    }


def roster_members(rows: list[RosterRow], today: date) -> list[dict]:
    students = {
        str(s.id): s
        for s in StudentProfile.objects.filter(id__in=[r.student_profile_id for r in rows]).select_related("user")
    }
    members = []
    for row in rows:
        student = students.get(row.student_profile_id)
        if student is None:
            continue
        members.append({
            "student_profile": row.student_profile_id,
            "student_name": student.user.get_full_name(),
            "student_login_id": student.user.login_id,
            "phone": student.user.phone,
            "invoice_count": len(row.invoices),
            "total_amount": row.total_amount,
            "paid_amount": row.paid_amount,
            "balance": row.balance,
            "due_date": row.due_date,
            "status": row.status,
            "is_overdue": row.is_overdue(today),
        })
    # Who still owes first, then by name — the admin is looking for debtors.
    order = {ROW_UNPAID: 0, ROW_PARTIAL: 1, ROW_PAID: 2}
    members.sort(key=lambda m: (order[m["status"]], m["student_name"].lower()))
    return members
