from django.db import migrations, transaction


def backfill_student_grades_view(apps, schema_editor):
    """`grades:view` was just added to DEFAULT_ROLE_PERMISSIONS["student"]
    (see foundation/permissions_catalog.py's "grades" note) for the Student
    portal's own Grades page. The `grades`/`view` Permission row already
    exists (seeded by grades/migrations/0001_seed_permissions.py) — this
    only re-runs provision_default_roles() so every existing org's
    already-provisioned student Role picks up the new RolePermission link.
    Idempotent (get_or_create throughout), safe to re-run.

    Same already-fixed org-backfill mechanics as
    finance/migrations/0006_grant_student_finance_view.py (read orgs
    through auth_bypass_rls with real org context applied, hand
    provision_default_roles() a *live* Organization instance) — reused
    verbatim rather than re-deriving.
    """

    from common.context import apply_org_context
    from foundation.models import Organization as LiveOrganization
    from foundation.services import provision_default_roles

    from django.db import connections

    connections["auth_bypass_rls"].settings_dict["NAME"] = connections["default"].settings_dict["NAME"]
    connections["auth_bypass_rls"].close()

    Organization = apps.get_model("foundation", "Organization")
    for org in Organization.objects.using("auth_bypass_rls").only("id"):
        with transaction.atomic():
            apply_org_context(str(org.id))
            provision_default_roles(LiveOrganization(id=org.id))


def noop_reverse(apps, schema_editor):
    """Not worth unwinding — a student keeping read access to their own
    computed grade summary after a rollback isn't a meaningful regression,
    and the RolePermission rows are still exactly what the (unrolled-back)
    catalog describes."""


class Migration(migrations.Migration):
    dependencies = [
        ("grades", "0001_seed_permissions"),
    ]

    operations = [
        migrations.RunPython(backfill_student_grades_view, reverse_code=noop_reverse),
    ]
