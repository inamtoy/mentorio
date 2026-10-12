from django.db import migrations

# Same updated_at trigger as 0002_triggers.py and the same tenant-isolation
# policy as 0003_rls.py, for the two tables added in 0005.
TABLES = ["notification_deliveries", "parent_telegram_links"]

FORWARD = "\n".join(
    f"""
    CREATE TRIGGER trg_{table}_updated_at BEFORE INSERT OR UPDATE ON notification.{table}
        FOR EACH ROW EXECUTE FUNCTION foundation.update_updated_at();

    ALTER TABLE notification.{table} ENABLE ROW LEVEL SECURITY;
    ALTER TABLE notification.{table} FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_{table} ON notification.{table}
        USING (
            organization_id = current_setting('app.current_org_id', true)::uuid
            OR foundation.is_platform_user()
        );
    """
    for table in TABLES
)

REVERSE = "\n".join(
    f"""
    DROP POLICY IF EXISTS tenant_isolation_{table} ON notification.{table};
    ALTER TABLE notification.{table} NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE notification.{table} DISABLE ROW LEVEL SECURITY;
    DROP TRIGGER IF EXISTS trg_{table}_updated_at ON notification.{table};
    """
    for table in TABLES
)


class Migration(migrations.Migration):
    dependencies = [
        ("notifications", "0005_delivery_and_parent_links"),
    ]

    operations = [
        migrations.RunSQL(sql=FORWARD, reverse_sql=REVERSE),
    ]
