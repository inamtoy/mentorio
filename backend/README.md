# Mentorio Backend

Django + DRF backend for Mentorio. `foundation` and `auth_custom` (organizations,
branches, users, RBAC, JWT auth with real session tracking) shipped first as
Phase 0; `student`, `teacher`, `course`, `groups`, `attendance`, `finance`,
`notifications`, `schedule`, `homework` (assignments + submissions),
`payment_gateways` (Payme/Click checkout links + webhooks), `billing`
(the platform's own subscription-plan catalog sold to organizations —
distinct from `finance`, which is an organization billing its own students),
`exams` (exam scheduling + per-student results), `grades` (computed grade
summaries, no stored model), and `reports` (computed org-wide Admin
reporting summaries, no stored model — see `reports/views.py`'s module
docstring for why the original `report`/`ai` schema plan's cached-snapshot
design was dropped in favor of this) have since been added on top of it.
`ai` is still a later phase (needs actual LLM integration groundwork this
backend doesn't have yet). See
`C:\Users\qrina\.claude\plans\stateful-gliding-perlis.md` for the full
architecture plan this was built from (payment_gateways has its own plan,
`C:\Users\qrina\.claude\plans\effervescent-foraging-puzzle.md`; billing/
platform-payments has its own plan too,
`C:\Users\qrina\.claude\plans\hazy-orbiting-lantern.md`).

## Prerequisites

- PostgreSQL 14+ (not installed in the environment this was built in — you
  need to provide one, locally or remote)
- Python 3.11+ and [`uv`](https://docs.astral.sh/uv/)

## One-time Postgres role setup

The multi-tenancy design uses Row-Level Security with **two distinct,
non-superuser roles** — the app deliberately never connects as the table
owner (owners silently bypass `FORCE ROW LEVEL SECURITY`, which would make
the whole RLS layer a no-op):

```sql
-- Run these as a superuser, once, against the target database.
CREATE DATABASE educore;
\c educore

-- Owns all tables/schemas — this is whichever role runs `manage.py migrate`.
-- Typically your existing superuser/admin role is fine for this.

-- Regular app connection — NOT the owner, NOT superuser, no BYPASSRLS.
-- This is what every normal request uses; RLS applies to it in full.
-- Every app schema needs this — not just foundation/auth. Each new app
-- (course, groups, ...) adds its own CREATE SCHEMA IF NOT EXISTS in its
-- 0001_initial migration, but that migration runs as the superuser/owner;
-- it does NOT grant educore_app/educore_auth_bypass access to what it just
-- created — do that here, once per app, or every request against the new
-- app 500s with "permission denied for schema <name>" even though
-- `manage.py migrate` itself succeeded (RLS policies also don't help here:
-- this is plain schema/table privilege, evaluated before RLS ever runs).
-- REFERENCES too, not just the four DML verbs — a *new* app's migration
-- (like payment_gateways's) creating a foreign key against a table owned
-- by a different role fails otherwise, even though educore_app already has
-- SELECT/INSERT/UPDATE/DELETE on that table. CREATEDB is also needed —
-- `pytest` provisions its own `test_<name>` database per run.
ALTER ROLE educore_app CREATEDB;
CREATE ROLE educore_app LOGIN PASSWORD 'change-me';
GRANT USAGE ON SCHEMA foundation, auth, student, teacher, course, "group", attendance, finance, notification, schedule, homework, payment_gateways, billing, exams TO educore_app;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES ON ALL TABLES IN SCHEMA foundation, auth, student, teacher, course, "group", attendance, finance, notification, schedule, homework, payment_gateways, billing, exams TO educore_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA foundation, auth, student, teacher, course, "group", attendance, finance, notification, schedule, homework, payment_gateways, billing, exams
    GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES ON TABLES TO educore_app;

-- Used ONLY by the login endpoint's initial login_id -> user lookup, which
-- necessarily runs before any org context exists (see
-- common/middleware.py and auth_custom/views.py::LoginView). BYPASSRLS,
-- but still not a superuser — keep this role's blast radius as narrow as
-- the login/session/refresh-token code paths that actually use it.
CREATE ROLE educore_auth_bypass LOGIN PASSWORD 'change-me-too' BYPASSRLS;
GRANT USAGE ON SCHEMA foundation, auth, student, teacher, course, "group", attendance, finance, notification, schedule, homework, payment_gateways, billing, exams TO educore_auth_bypass;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA foundation, auth, student, teacher, course, "group", attendance, finance, notification, schedule, homework, payment_gateways, billing, exams TO educore_auth_bypass;
ALTER DEFAULT PRIVILEGES IN SCHEMA foundation, auth, student, teacher, course, "group", attendance, finance, notification, schedule, homework, payment_gateways, billing, exams
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO educore_auth_bypass;
```

Run `manage.py migrate` as whatever role owns the database (a superuser is
simplest for local dev) — **not** as `educore_app` or `educore_auth_bypass`,
both of which lack the privileges to create schemas/extensions/functions.

**Test database needs the exact same grants, separately.** `pytest` (see
below) provisions its own `test_<DB_NAME>` database, which starts with
*none* of the above — `manage.py migrate` there runs as `educore_app` itself
(now that it has `CREATEDB`), so it ends up owning every schema/table it
creates, but `educore_auth_bypass` still needs the block above re-run
against that database specifically (`\c test_educore_test` first). This is
lost every time the test database is dropped and recreated from scratch
(plain `pytest` with no `--reuse-db`/`--keepdb` does this on every run) —
use `pytest --reuse-db` day to day so it's a one-time cost, not a
per-run one.

## Setup

```bash
cd backend
uv sync
cp .env.example .env   # fill in DB credentials for the two roles above
uv run python manage.py migrate
uv run python manage.py create_super_admin --first-name Alex --last-name Rivera --phone +998901234567
uv run python manage.py runserver
```

`create_super_admin` prints the generated `login_id` (e.g. `EDU100001`) —
that, plus the password you're prompted for, is what the frontend's existing
"Login" field (not email — see below) authenticates with.

## Why no email/username login, and no email field at all

`foundation.users` has no `email` column — login is by `login_id`, never
email, and no code path ever read a user's email for anything else either
(no email verification flow is wired up; phone +
`auth_custom.PhoneVerification` is the one real contact/verification
channel). Reserving schema/index space for a field nothing uses isn't a
safety margin, so it was removed rather than left "just in case". Every
user instead gets a system-generated, globally-unique `login_id` at
creation (`foundation/managers.py`) — this is what the frontend's login page
already expects (`autoComplete="username"`, generic "Login" label, not
"Email"). A separate `member_code` is also generated per user, reserved for
the future Finance module's invoices — deliberately a different value from
`login_id` so login credentials and financial records never share an
identifier.

Organizations and Branches keep their own `email` field — that's org/branch
contact info, unrelated to how an individual user logs in.

## Verifying the setup

1. `POST /api/v1/auth/login/` with `{"login_id": "EDU100001", "password": "..."}`
   → should return `{"success": true, "data": {"access": "...", "refresh": "...", "user": {...}}}`.
2. `GET /api/v1/organizations/` with `Authorization: Bearer <access>` → should
   list organizations, scoped by RLS to the caller's own org unless they
   hold a system-level role (super_admin), in which case they see all of them.
3. `GET /api/v1/auth/sessions/` → the session created at step 1 should
   appear with `"current": true`.
4. `POST /api/v1/auth/sessions/<id>/revoke/` on a *different* session →
   `200`; the next authenticated request using that session's token should
   then get `401` immediately (not just at token expiry) — this is what
   powers the "Revoke" button already built on the Teacher/Super-Admin
   Profile pages' Active Sessions UI.
5. `uv run pytest --reuse-db` — full suite (167 tests as of 2026-08-16),
   including RBAC/ownership/RLS-isolation checks, run against the real
   `educore_app`/`educore_auth_bypass` connections (not a superuser
   override) — requires both Postgres roles above to exist, *with the same
   grants*, on the test database too (see "Test database needs the exact
   same grants" above).

## What's deliberately NOT here yet

No `django.contrib.admin` (the schema has no `is_staff`/`is_superuser` —
"super admin" is an RBAC role assignment, not a user flag; the Super-Admin
frontend portal + this API is the real admin surface). No reports/AI app
yet — its own future phase.
