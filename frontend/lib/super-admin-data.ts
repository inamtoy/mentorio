// ─── Super Admin Data ─────────────────────────────────────────────────────────

// Stats mock object (SA_STATS) and Centers mock array (SA_CENTERS, plus its
// CenterStatus/SubscriptionTier/SACenter types) were removed here
// (2026-08-21) once app/super-admin/page.tsx (the Dashboard) and
// app/super-admin/reports/page.tsx (their last two consumers) both
// switched to real Organizations/Branches/Students/Teachers/Administrators
// queries — see lib/queries/organizations.ts and this file's own "Reports"
// note further down. lib/store/sa-centers-store.ts, SA_CENTERS' only other
// consumer, was already fully orphaned before this pass (the real
// Super-Admin Centers list page has used the real Groups/Organizations API
// since an earlier session) — deleted alongside these.

// Branches mock array (SA_BRANCHES, plus its BranchStatus/SABranch
// types) was removed here (2026-08-21): lib/store/sa-branches-store.ts,
// its only consumer, was already fully orphaned before this pass — the
// real Super-Admin Branches page has used the real Branches API all
// along and never imported this store.

// Admins mock array (SA_ADMINS, plus its AdminRole/AdminStatus/SAAdmin
// types) was removed here (2026-08-21): lib/store/sa-administrators-store.ts,
// its only consumer, was already fully orphaned before this pass — the
// real Super-Admin Administrators page has used the real Administrators
// API all along and never imported this store.

// Teachers mock array (SA_TEACHERS, plus its TeacherStatus/SATeacher
// types) was removed here (2026-08-21): lib/store/sa-teachers-store.ts,
// its only consumer, was already fully orphaned before this pass — the
// real Super-Admin Teachers page has used the real Teachers API all
// along and never imported this store.

// Students mock array (SA_STUDENTS, plus its StudentStatus/SAStudent
// types) was removed here (2026-08-21): lib/store/sa-students-store.ts,
// its only consumer, was already fully orphaned before this pass — the
// real Super-Admin Students page has used the real Students API all
// along and never imported this store.

// Subscriptions mock array (SA_SUBSCRIPTIONS, plus its BillingCycle/
// SASubscription types) was removed here (2026-08-21) once
// app/super-admin/reports/page.tsx (its only consumer, for the
// Subscription Revenue Breakdown card) switched to a real per-plan revenue
// breakdown computed from Organization.subscription_plan_detail joined
// against real PlatformPayment amounts — see lib/queries/billing.ts.

// ─── Payments ─────────────────────────────────────────────────────────────────

export type PaymentMethod = "card" | "transfer" | "online";
export type PaymentStatus = "paid" | "pending" | "failed" | "refunded";

export interface SAPayment {
  id: string;
  centerName: string;
  amount: number;
  plan: string;
  method: PaymentMethod;
  date: string;
  status: PaymentStatus;
  invoiceId: string;
}

export const SA_PAYMENTS: SAPayment[] = [
  { id: "p1",  centerName: "Bright Future Academy",     amount: 599,  plan: "Enterprise", method: "card",     date: "2026-07-01", status: "paid",    invoiceId: "INV-2026-0701" },
  { id: "p2",  centerName: "Nova Learning Hub",         amount: 249,  plan: "Pro",        method: "transfer", date: "2026-07-01", status: "paid",    invoiceId: "INV-2026-0702" },
  { id: "p3",  centerName: "Pinnacle Education Center", amount: 599,  plan: "Enterprise", method: "card",     date: "2026-07-02", status: "paid",    invoiceId: "INV-2026-0703" },
  { id: "p4",  centerName: "Horizon Academy",           amount: 249,  plan: "Pro",        method: "online",   date: "2026-07-02", status: "paid",    invoiceId: "INV-2026-0704" },
  { id: "p5",  centerName: "EduStar Institute",         amount: 99,   plan: "Basic",      method: "card",     date: "2026-07-03", status: "pending", invoiceId: "INV-2026-0705" },
  { id: "p6",  centerName: "Maple Leaf Learning",       amount: 99,   plan: "Basic",      method: "online",   date: "2026-07-03", status: "paid",    invoiceId: "INV-2026-0706" },
  { id: "p7",  centerName: "Summit Skills Institute",   amount: 249,  plan: "Pro",        method: "transfer", date: "2026-06-30", status: "failed",  invoiceId: "INV-2026-0707" },
  { id: "p8",  centerName: "Coastal Kids Academy",      amount: 49,   plan: "Starter",    method: "card",     date: "2026-07-01", status: "paid",    invoiceId: "INV-2026-0708" },
  { id: "p9",  centerName: "Bright Future Academy",     amount: 599,  plan: "Enterprise", method: "card",     date: "2026-06-01", status: "paid",    invoiceId: "INV-2026-0601" },
  { id: "p10", centerName: "Nova Learning Hub",         amount: 249,  plan: "Pro",        method: "transfer", date: "2026-06-01", status: "paid",    invoiceId: "INV-2026-0602" },
  { id: "p11", centerName: "Pinnacle Education Center", amount: 599,  plan: "Enterprise", method: "card",     date: "2026-06-02", status: "paid",    invoiceId: "INV-2026-0603" },
  { id: "p12", centerName: "EduStar Institute",         amount: 99,   plan: "Basic",      method: "online",   date: "2026-06-15", status: "refunded",invoiceId: "INV-2026-0604" },
  { id: "p13", centerName: "Horizon Academy",           amount: 249,  plan: "Pro",        method: "card",     date: "2026-06-02", status: "paid",    invoiceId: "INV-2026-0605" },
  { id: "p14", centerName: "Maple Leaf Learning",       amount: 99,   plan: "Basic",      method: "online",   date: "2026-06-05", status: "paid",    invoiceId: "INV-2026-0606" },
  { id: "p15", centerName: "Summit Skills Institute",   amount: 249,  plan: "Pro",        method: "transfer", date: "2026-05-31", status: "paid",    invoiceId: "INV-2026-0501" },
];

// Audit Logs mock array (SA_AUDIT_LOGS), its SAAuditLog/AuditSeverity
// types, were removed here (2026-08-21) once app/super-admin/page.tsx (its
// only consumer) switched its Recent Activity card to real Audit Logs —
// see lib/queries/audit-logs.ts (the Super-Admin Audit Logs page already
// used the real one; this Dashboard card was the last mock holdout).

// Chart Data mock arrays (MONTHLY_REVENUE_SA/STUDENT_GROWTH_SA/
// BRANCH_GROWTH_SA) and Subscription Distribution (SUBSCRIPTION_DIST_SA,
// removed in an earlier pass) all had the same two consumers — the
// Dashboard and this Reports page — and both switched together
// (2026-08-21) to real month-bucketed data computed from
// Organizations/Branches/StudentProfile/PlatformPayment via the shared
// helpers in lib/growth-metrics.ts. See app/super-admin/page.tsx and
// app/super-admin/reports/page.tsx.

// Super Admin Profile mock object (SA_PROFILE) was removed here
// (2026-08-21) once app/super-admin/layout.tsx's header user-dropdown
// (its last consumer) switched to the real logged-in user via
// useAuthStore — same pattern already used by app/teacher/layout.tsx's
// TeacherHeader and app/student/layout.tsx's StudentHeader.
// app/super-admin/profile/page.tsx has used the real Users/Sessions/
// Audit Logs APIs all along, and no longer needs to sync this cache.
