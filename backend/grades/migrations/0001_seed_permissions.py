from django.db import migrations, transaction


def seed_permissions_and_backfill_roles(apps, schema_editor):
    """Same pattern as teacher/migrations/0006_seed_teacher_salary_permission.py
    (the fully-debugged version of this pattern — reused verbatim here, not
    one of the earlier, buggier copies still on some other migrations) —
    seeds the (now grades-inclusive) Permission catalog and re-runs
    provision_default_roles() for every existing org so their
    already-provisioned teacher roles pick up the new `grades:view` grant.
    Idempotent throughout, safe to re-run.

    `grades` has no models/schema migration of its own — this is the app's
    only migration, a pure data migration seeding a permission for a
    view-only, computed (not stored) endpoint. See
    foundation/permissions_catalog.py's "grades" docstring note.
    """

    from common.context import apply_org_context
    from foundation.permissions_catalog import PERMISSIONS_CATALOG
    from foundation.models import Organization as LiveOrganization
    from foundation.services import provision_default_roles

    Permission = apps.get_model("foundation", "Permission")
    for module, action, description in PERMISSIONS_CATALOG:
        Permission.objects.get_or_create(module=module, action=action, defaults={"description": description})

    from django.db import connections

    connections["auth_bypass_rls"].settings_dict["NAME"] = connections["default"].settings_dict["NAME"]
    connections["auth_bypass_rls"].close()

    Organization = apps.get_model("foundation", "Organization")
    for org in Organization.objects.using("auth_bypass_rls").only("id"):
        with transaction.atomic():
            apply_org_context(str(org.id))
            provision_default_roles(LiveOrganization(id=org.id))


def unseed_permissions(apps, schema_editor):
    Permission = apps.get_model("foundation", "Permission")
    Permission.objects.filter(module="grades").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("foundation", "0011_seed_platform_settings_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions_and_backfill_roles, reverse_code=unseed_permissions),
    ]
