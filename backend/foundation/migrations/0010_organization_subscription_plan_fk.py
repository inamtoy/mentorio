import django.db.models.deletion
from django.db import migrations, models


def _sync_auth_bypass_rls_to_default():
    """`auth_bypass_rls` is configured with `"TEST": {"MIRROR": "default"}`
    (config/settings/base.py) so that under `pytest` it targets the *same*
    ephemeral test database as `default`, not a second physical one — but
    that redirection is applied to the alias by Django's test setup at some
    point during `setup_databases()`, not necessarily before *this specific*
    migration's RunPython executes. Observed concretely (see
    attendance/migrations/0004_seed_permissions.py's docstring for the full
    investigation): on a fresh `migrate`, this connection can still resolve
    to the real dev database's name while `default` (whatever `manage.py
    migrate` is actually migrating) is already correctly on the test
    database — so reads/writes through this alias silently target the wrong
    physical database instead of erroring. Fixed by force-syncing the alias
    to whatever `default` is *actually* migrating, right before use — a
    no-op in production, where both aliases already point at the same
    database.
    """
    from django.db import connections

    connections["auth_bypass_rls"].settings_dict["NAME"] = connections["default"].settings_dict["NAME"]
    connections["auth_bypass_rls"].close()


def migrate_string_to_fk(apps, schema_editor):
    """BUG FIXED HERE (2026-08-12): this used to read/write through the
    RLS-enforced `default` connection with no org context applied.
    foundation.organizations' RLS policy requires `app.current_org_id` to
    match the row (or is_platform_user()), so with neither set,
    `Organization.objects.all()` silently returned ZERO rows — no
    pre-existing org's subscription_plan_old value was ever actually read
    or migrated to the new FK, despite `manage.py migrate` reporting
    success. Same root cause as
    teacher/migrations/0006_seed_teacher_salary_permission.py's docstring;
    fixed the same way — read and write through the auth_bypass_rls alias,
    which has BYPASSRLS and needs no per-row context at all.

    ANOTHER BUG FIXED HERE (2026-08-14): see _sync_auth_bypass_rls_to_default()
    above — this could still target the wrong physical database on a fresh
    `migrate`.
    """
    _sync_auth_bypass_rls_to_default()

    Organization = apps.get_model("foundation", "Organization")
    SubscriptionPlan = apps.get_model("billing", "SubscriptionPlan")
    plan_id_by_slug = {
        plan.slug: plan.id for plan in SubscriptionPlan.objects.using("auth_bypass_rls").all()
    }

    for org in Organization.objects.using("auth_bypass_rls").all().iterator():
        plan_id = plan_id_by_slug.get(org.subscription_plan_old)
        if plan_id is not None:
            Organization.objects.using("auth_bypass_rls").filter(pk=org.pk).update(subscription_plan_id=plan_id)


def migrate_fk_to_string(apps, schema_editor):
    """Reverse — only exercised if this migration is ever rolled back.
    Anything with no matching plan (shouldn't happen going forward, but a
    plan could theoretically have been hard-deleted by then) falls back to
    "free" rather than leaving the old CharField NULL, since that column
    doesn't allow null. Same auth_bypass_rls fix as the forward function,
    including the 2026-08-14 connection-sync one.
    """
    _sync_auth_bypass_rls_to_default()

    Organization = apps.get_model("foundation", "Organization")
    SubscriptionPlan = apps.get_model("billing", "SubscriptionPlan")
    slug_by_plan_id = {
        plan.id: plan.slug for plan in SubscriptionPlan.objects.using("auth_bypass_rls").all()
    }

    for org in Organization.objects.using("auth_bypass_rls").all().iterator():
        slug = slug_by_plan_id.get(org.subscription_plan_id, "free")
        Organization.objects.using("auth_bypass_rls").filter(pk=org.pk).update(subscription_plan_old=slug)


class Migration(migrations.Migration):
    """Converts `Organization.subscription_plan` from a fixed 6-value enum
    (CharField) to a FK into the new dynamic `billing.SubscriptionPlan`
    catalog. Multi-step (rename old column out of the way -> add the real FK
    -> data-migrate by slug -> drop the old column) rather than a single
    AlterField, because Postgres can't `ALTER COLUMN TYPE varchar -> uuid`
    with a meaningful `USING` clause on its own — the old -> new mapping is
    a lookup (via billing's seeded plan slugs), not a cast.

    Confirmed by grepping the whole backend before writing this: the string
    value was only ever read/written in organization.py (the field itself),
    serializers.py, filters.py, and create_super_admin.py (a literal
    "enterprise") — nothing branches application logic on it, so this is a
    low-risk data shape change. The new field is nullable specifically so
    this migration touches zero test fixtures across the whole suite — many
    create an Organization without ever setting subscription_plan at all,
    and a NOT NULL column would need a migration-time-constant FK default,
    which a data-seeded row can't provide. See the plan doc for the full
    design discussion: C:\\Users\\qrina\\.claude\\plans\\hazy-orbiting-lantern.md

    BUG FIXED HERE (2026-08-19): `atomic = False` is load-bearing, not
    optional — without it, this migration deadlocks every single time on a
    genuinely fresh `migrate` (never surfaced before: every environment
    that had ever run this migration reused an already-migrated dev/test
    database via --reuse-db, so it only actually re-executed for the first
    time in CI once CI itself started actually running, see the CI
    workflow's own "Migrate test database" step comment). The AddField
    above takes an ACCESS EXCLUSIVE lock on `organizations` that, in an
    atomic migration, is held until the *whole migration's* transaction
    commits — including through the RunPython step below, which queries
    that same `organizations` table via the separate auth_bypass_rls
    connection. That SELECT needs only ACCESS SHARE, but blocks waiting
    for the still-open transaction on the default connection to release
    its lock — which never happens, because the default connection is
    just sitting idle in Python, waiting for RunPython (running on the
    *other* connection) to return. A real deadlock, but not one Postgres's
    own detector catches, since the default connection was never actually
    waiting on a lock itself. `atomic = False` makes each operation commit
    immediately, so AddField's lock is long gone before RunPython ever
    queries the table.
    """

    atomic = False

    dependencies = [
        ("foundation", "0009_seed_audit_logs_permission"),
        ("billing", "0004_seed_plans"),
    ]

    operations = [
        migrations.RenameField(
            model_name="organization", old_name="subscription_plan", new_name="subscription_plan_old",
        ),
        migrations.AddField(
            model_name="organization",
            name="subscription_plan",
            field=models.ForeignKey(
                null=True, blank=True, on_delete=django.db.models.deletion.PROTECT,
                to="billing.subscriptionplan", db_column="subscription_plan_id",
            ),
        ),
        migrations.RunPython(migrate_string_to_fk, reverse_code=migrate_fk_to_string),
        migrations.RemoveField(model_name="organization", name="subscription_plan_old"),
    ]
