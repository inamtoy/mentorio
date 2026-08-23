from django.db import migrations, transaction


def seed_permissions_and_backfill_roles(apps, schema_editor):
    """Same pattern as grades/migrations/0001_seed_permissions.py (the
    fully-debugged version of this pattern, reused verbatim) — seeds the
    (now reports-inclusive) Permission catalog and re-runs
    provision_default_roles() for every existing org so their
    already-provisioned center_admin roles pick up the new `reports:view`
    grant. Idempotent throughout, safe to re-run.

    `reports` has no models/schema migration of its own — this is the
    app's only migration, a pure data migration seeding a permission for
    four view-only, computed (not stored) endpoints. See
    foundation/permissions_catalog.py's "reports" docstring note.
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
    Permission.objects.filter(module="reports").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("foundation", "0011_seed_platform_settings_permission"),
    ]

    operations = [
        migrations.RunPython(seed_permissions_and_backfill_roles, reverse_code=unseed_permissions),
    ]
