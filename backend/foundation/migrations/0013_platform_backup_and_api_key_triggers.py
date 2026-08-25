from django.db import migrations

# Same pattern as 0006_add_missing_updated_at_triggers.py / every other
# app's 0002_triggers.py — TimestampedMixin's `updated_at` is written by
# this Postgres trigger, not Django (see common/models.py's docstring).
TABLES_WITH_UPDATED_AT = ["platform_backups", "api_keys"]

CREATE_TRIGGERS = "\n".join(
    f"""
    CREATE TRIGGER trg_{table}_updated_at BEFORE INSERT OR UPDATE ON foundation.{table}
        FOR EACH ROW EXECUTE FUNCTION foundation.update_updated_at();
    """
    for table in TABLES_WITH_UPDATED_AT
)

DROP_TRIGGERS = "\n".join(
    f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON foundation.{table};" for table in TABLES_WITH_UPDATED_AT
)


class Migration(migrations.Migration):
    dependencies = [
        ("foundation", "0012_platform_backup_and_api_key"),
    ]

    operations = [
        migrations.RunSQL(sql=CREATE_TRIGGERS, reverse_sql=DROP_TRIGGERS),
    ]
