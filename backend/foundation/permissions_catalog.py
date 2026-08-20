"""Canonical (module, action) catalog — kept in sync with every
`permission_map`/`required_permission` actually referenced in the codebase
(grep for `permission_map = {` across every app). Not the aspirational list
in `database/15-seed-and-recommendations.sql`, which predates several
implementation decisions (e.g. that file uses action "read" and a "users"
module; the real code uses "view" and "administrators" — see
`foundation/views.py::UserViewSet`) and includes modules for apps that don't
exist yet (homework, exams, ...). Extend this list — and the data
migration that loads it — as new apps/ViewSets are added.

`notifications`, `schedule`, `assignments`, and `submissions` were added
2026-08-07. `audit_logs` was added the same day, for the read-only
Super-Admin/Admin Audit Logs surface — see `foundation/views.py::AuditLogViewSet`.

`exams` was added 2026-08-16 — one module (not split like assignments/
submissions) since both `Exam` scheduling and `ExamResult` score entry are
teacher/center_admin-only writes; there's no "student authors their own row"
case the way `Submission` has, so a module-wide grant can't overreach the
way the assignments/submissions split was needed for. `teacher` gets create/
update but not delete (cancel an exam via a status update instead, same
convention as `schedule`/`assignments`); `student` gets view only. See
`exams/views.py` for the read-scoping split — `Exam` reads are unrestricted
within the org (schedule metadata), `ExamResult` reads are row-scoped (a
grade, same sensitivity as `submissions`).

`payment_gateways` was added 2026-08-08, for the Admin Settings "Payment
Gateways" surface (a center's own Payme/Click merchant credentials) — see
`payment_gateways/views.py::PaymentGatewayAccountViewSet`. center_admin-only,
same reasoning as `finance`/`audit_logs`.

`student` picked up `finance:view` and `payment_gateways:view` later the
same day, for the Student portal's own "Pay" flow — see the comment next to
those two grants below for why this doesn't reopen the module-wide-grant
risk the rest of this file's `finance`/`audit_logs` comments warn about.

`billing` was added 2026-08-09, for the Super-Admin "Subscription Plans"
catalog (platform <-> organization billing — Mentorio selling a center a
plan tier — distinct from both `finance` (a center billing its own
students) and `payment_gateways` (a student paying that center online); see
`billing/models/subscription_plan.py`'s docstring). Deliberately absent from
every `DEFAULT_ROLE_PERMISSIONS` entry below, unlike every other module in
this file — only a system-level role (super_admin) is ever meant to manage
the catalog, and `common.permissions.user_has_permission`'s platform-role
bypass already grants that with no per-module grant needed.

`platform_billing` was added the same day, for PlatformInvoice/
PlatformPayment (Mentorio's own invoices to organizations and the manually-
confirmed payments against them) — see `billing/views.py::PLATFORM_BILLING_
PERMISSION_MAP`'s comment for why this is a *separate* module from `billing`
above rather than reusing it: `billing` (the plan catalog) is public
reference data every org could eventually be granted read access to, while
this is Mentorio's own sensitive cross-organization ledger — sharing one
module would let a future `billing:view` grant (for plan pricing) also hand
out write access to platform invoices/payments. Same "absent from
DEFAULT_ROLE_PERMISSIONS, system-role bypass only" treatment as `billing`.

`platform_settings` was added 2026-08-09 too, for the Super-Admin System
Settings page's General/Security panels (platform-wide config, stored via
`foundation.Setting` — see `foundation/services.py`'s docstring on
`PLATFORM_SETTINGS_DEFAULTS`). No `create`/`delete` action — these are
singleton config blobs, always read or upserted, never created/deleted as
distinct rows. Same "system-role bypass only, absent from
DEFAULT_ROLE_PERMISSIONS" treatment as `billing`/`platform_billing` above.

`grades` was added 2026-08-21, for the Teacher Portal's Grades page — see
`grades/views.py::TeacherGradeSummaryView`. Unlike every other module in
this file, there is no underlying model/table: a "grade" is computed live
from `Submission`/`ExamResult`/`Attendance` rows the caller already has
`assignments`/`submissions`/`exams`/`attendance` grants for, so this only
ever needs a `view` action — no create/update/delete, nothing to write to.
`teacher`-only for now, further narrowed to the caller's own groups by the
view itself (same "object-scoped grant" pattern as `teacher_salary`); no
`center_admin`/`student` grant yet since no oversight/self-view surface
for those roles has been built (unlike `exams`, which landed for all three
roles together because all three surfaces shipped in the same change).

`teacher_salary` was split out of `teachers` on 2026-08-12 — TeacherSalaryViewSet
had been reusing `teachers`' permission_map, which meant `teacher:update`
(granted module-wide so a teacher can edit their own profile bio/education —
see the comment on that grant below) also let any teacher PATCH any other
teacher's salary, and `teacher:view` let them list every salary in the org.
Salary is compensation data — same confidentiality bar as `finance`/
`audit_logs` — so it gets its own module, full CRUD center_admin-only, with
`teacher` getting `view` only, further narrowed to their own row by
TeacherSalaryViewSet.get_queryset() (same "object-scoped grant" pattern as
`finance`/`payment_gateways` for the `student` role above).
"""

PERMISSIONS_CATALOG: list[tuple[str, str, str]] = [
    # (module, action, description)
    ("organizations", "view", "View organizations"),
    ("organizations", "create", "Create organizations"),
    ("organizations", "update", "Update organizations"),
    ("organizations", "delete", "Delete organizations"),
    ("branches", "view", "View branches"),
    ("branches", "create", "Create branches"),
    ("branches", "update", "Update branches"),
    ("branches", "delete", "Delete branches"),
    ("administrators", "view", "View administrator accounts"),
    ("administrators", "create", "Create administrator accounts"),
    ("administrators", "update", "Update administrator accounts"),
    ("administrators", "delete", "Delete administrator accounts"),
    ("roles", "view", "View roles and permissions"),
    ("students", "view", "View student profiles"),
    ("students", "create", "Create student profiles"),
    ("students", "update", "Update student profiles"),
    ("students", "delete", "Delete student profiles"),
    ("teachers", "view", "View teacher profiles"),
    ("teachers", "create", "Create teacher profiles"),
    ("teachers", "update", "Update teacher profiles"),
    ("teachers", "delete", "Delete teacher profiles"),
    ("courses", "view", "View courses"),
    ("courses", "create", "Create courses"),
    ("courses", "update", "Update courses"),
    ("courses", "delete", "Delete courses"),
    ("groups", "view", "View groups"),
    ("groups", "create", "Create groups"),
    ("groups", "update", "Update groups"),
    ("groups", "delete", "Delete groups"),
    ("attendance", "view", "View attendance records"),
    ("attendance", "create", "Mark attendance"),
    ("attendance", "update", "Update attendance records"),
    ("attendance", "delete", "Delete attendance records"),
    ("finance", "view", "View invoices and payments"),
    ("finance", "create", "Create invoices and record payments"),
    ("finance", "update", "Update invoices"),
    ("finance", "delete", "Delete invoices"),
    ("notifications", "view", "View own notifications"),
    ("notifications", "create", "Send notifications"),
    ("notifications", "update", "Mark own notifications read/unread"),
    ("notifications", "delete", "Delete own notifications"),
    ("schedule", "view", "View lessons"),
    ("schedule", "create", "Schedule lessons"),
    ("schedule", "update", "Update/cancel lessons"),
    ("schedule", "delete", "Delete lessons"),
    ("assignments", "view", "View homework assignments"),
    ("assignments", "create", "Create homework assignments"),
    ("assignments", "update", "Update homework assignments"),
    ("assignments", "delete", "Delete homework assignments"),
    ("submissions", "view", "View homework submissions"),
    ("submissions", "create", "Submit homework"),
    ("submissions", "update", "Update/grade homework submissions"),
    ("submissions", "delete", "Delete homework submissions"),
    ("audit_logs", "view", "View audit logs"),
    ("payment_gateways", "view", "View payment gateway (Payme/Click) settings"),
    ("payment_gateways", "create", "Add payment gateway credentials"),
    ("payment_gateways", "update", "Update payment gateway credentials"),
    ("payment_gateways", "delete", "Remove payment gateway credentials"),
    ("billing", "view", "View subscription plans"),
    ("billing", "create", "Create subscription plans"),
    ("billing", "update", "Update subscription plans"),
    ("billing", "delete", "Delete subscription plans"),
    ("platform_billing", "view", "View platform invoices and payments"),
    ("platform_billing", "create", "Create platform invoices and record payments"),
    ("platform_billing", "update", "Update platform invoices and payments"),
    ("platform_billing", "delete", "Delete platform invoices and payments"),
    ("platform_settings", "view", "View platform-wide General/Security settings"),
    ("platform_settings", "update", "Update platform-wide General/Security settings"),
    ("teacher_salary", "view", "View teacher salary records"),
    ("teacher_salary", "create", "Create teacher salary records"),
    ("teacher_salary", "update", "Update teacher salary records"),
    ("teacher_salary", "delete", "Delete teacher salary records"),
    ("exams", "view", "View exams and results"),
    ("exams", "create", "Schedule exams and enter results"),
    ("exams", "update", "Update exams and results"),
    ("exams", "delete", "Delete exams and results"),
    ("grades", "view", "View computed grade summaries"),
]

# Default permission grants for the three org-scoped roles every
# organization gets on creation (see foundation/services.py::
# provision_default_roles). Deliberately narrower than a literal reading of
# database/15-seed-and-recommendations.sql's global role templates — those
# use organization_id IS NULL for teacher/student/administrator roles too,
# which would make foundation.is_platform_user() (checks ONLY
# organization_id IS NULL, not slug) grant every teacher and student
# cross-organization visibility. Real per-org roles avoid that.
DEFAULT_ROLE_PERMISSIONS: dict[str, list[tuple[str, str]]] = {
    "center_admin": [
        ("organizations", "view"),
        ("organizations", "update"),
        ("branches", "view"),
        ("branches", "create"),
        ("branches", "update"),
        ("branches", "delete"),
        ("administrators", "view"),
        ("administrators", "create"),
        ("administrators", "update"),
        ("administrators", "delete"),
        ("students", "view"),
        ("students", "create"),
        ("students", "update"),
        ("students", "delete"),
        ("teachers", "view"),
        ("teachers", "create"),
        ("teachers", "update"),
        ("teachers", "delete"),
        ("courses", "view"),
        ("courses", "create"),
        ("courses", "update"),
        ("courses", "delete"),
        ("groups", "view"),
        ("groups", "create"),
        ("groups", "update"),
        ("groups", "delete"),
        ("attendance", "view"),
        ("attendance", "create"),
        ("attendance", "update"),
        ("attendance", "delete"),
        # finance is deliberately center_admin-only — unlike every other
        # module, no other role gets even :view. Permission grants here are
        # module-wide, not object-scoped, so a "teacher" grant would mean
        # every teacher can see every student's balance, not just their own.
        # No portal but Admin has a Finance UI to wire anyway.
        ("finance", "view"),
        ("finance", "create"),
        ("finance", "update"),
        ("finance", "delete"),
        ("notifications", "view"),
        ("notifications", "create"),
        ("notifications", "update"),
        ("notifications", "delete"),
        ("schedule", "view"),
        ("schedule", "create"),
        ("schedule", "update"),
        ("schedule", "delete"),
        ("assignments", "view"),
        ("assignments", "create"),
        ("assignments", "update"),
        ("assignments", "delete"),
        ("submissions", "view"),
        ("submissions", "create"),
        ("submissions", "update"),
        ("submissions", "delete"),
        # audit_logs is deliberately center_admin-only, same reasoning as
        # finance — it's org-wide security/change history, not something a
        # teacher or student grant should ever cover.
        ("audit_logs", "view"),
        # payment_gateways is deliberately center_admin-only too — these are
        # the center's own Payme/Click merchant secrets, same "no other role
        # gets even :view" reasoning as finance.
        ("payment_gateways", "view"),
        ("payment_gateways", "create"),
        ("payment_gateways", "update"),
        ("payment_gateways", "delete"),
        ("roles", "view"),
        # See the module docstring's "teacher_salary" note — split out of
        # `teachers` because that grant is module-wide and salary is
        # compensation data, not something every teacher-editable module
        # should double as access control for.
        ("teacher_salary", "view"),
        ("teacher_salary", "create"),
        ("teacher_salary", "update"),
        ("teacher_salary", "delete"),
        ("exams", "view"),
        ("exams", "create"),
        ("exams", "update"),
        ("exams", "delete"),
    ],
    "teacher": [
        ("students", "view"),
        ("teachers", "view"),
        # "update" here is deliberately still safe org-wide at the module
        # level — TeacherProfileViewSet.perform_update further restricts a
        # teacher (not center_admin) to their OWN profile only, mirroring
        # AttendanceViewSet's teacher-owns-group check. Needed for the
        # Teacher Portal's Profile page to save bio/education/etc.
        ("teachers", "update"),
        # view-only, and further narrowed to the caller's own row by
        # TeacherSalaryViewSet.get_queryset() — a teacher has no create/
        # update/delete grant on this module at all, unlike `teachers`
        # above. See the module docstring's "teacher_salary" note.
        ("teacher_salary", "view"),
        ("courses", "view"),
        ("groups", "view"),
        ("attendance", "view"),
        ("attendance", "create"),
        ("attendance", "update"),
        ("notifications", "view"),
        ("notifications", "create"),
        ("notifications", "update"),
        ("notifications", "delete"),
        ("schedule", "view"),
        # No "schedule:delete" — same convention as attendance: a teacher
        # cancels a lesson via a status update, not a hard/soft delete.
        ("schedule", "create"),
        ("schedule", "update"),
        # No "assignments:delete" either, same reasoning — matches
        # attendance's precedent of admin-only delete.
        ("assignments", "view"),
        ("assignments", "create"),
        ("assignments", "update"),
        # Teachers grade (update) submissions but never create/delete one —
        # only the student who owns a submission does that.
        ("submissions", "view"),
        ("submissions", "update"),
        # No "exams:delete" — same convention as attendance/schedule: a
        # teacher cancels an exam via a status update, not a delete.
        ("exams", "view"),
        ("exams", "create"),
        ("exams", "update"),
        # view-only, further narrowed to the caller's own groups by
        # TeacherGradeSummaryView itself — see the module docstring's
        # "grades" note.
        ("grades", "view"),
        ("roles", "view"),
    ],
    "student": [
        ("students", "view"),
        ("courses", "view"),
        ("groups", "view"),
        ("attendance", "view"),
        # finance/payment_gateways :view is object-scoped for this role —
        # InvoiceViewSet/PaymentViewSet's get_queryset() narrows a student
        # caller to their own student_profile only, so this grant does NOT
        # mean "see every student's balance" the way it would for finance's
        # other, module-wide grants (see the comment on center_admin's own
        # finance grant above). payment_gateways:view only ever exposes
        # non-secret fields (merchant_id/is_active — never secret_key),
        # needed so the Student portal's "Pay" button knows which providers
        # a center has actually turned on.
        ("finance", "view"),
        ("payment_gateways", "view"),
        ("notifications", "view"),
        ("notifications", "update"),
        ("notifications", "delete"),
        ("schedule", "view"),
        ("assignments", "view"),
        # A student creates/updates only their OWN submission —
        # SubmissionViewSet enforces that at the object level, same pattern
        # as AttendanceViewSet's teacher-owns-group check.
        ("submissions", "view"),
        ("submissions", "create"),
        ("submissions", "update"),
        ("exams", "view"),
        ("roles", "view"),
    ],
}

DEFAULT_ROLE_NAMES: dict[str, str] = {
    "center_admin": "Center Admin",
    "teacher": "Teacher",
    "student": "Student",
}
