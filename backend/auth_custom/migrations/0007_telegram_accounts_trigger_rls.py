from django.db import migrations

# Same updated_at trigger (BEFORE INSERT OR UPDATE — see
# 0004_fix_updated_at_trigger_timing.py) and same tenant-isolation policy as
# every other auth.* table in 0003_rls.py.
FORWARD = """
CREATE TRIGGER trg_telegram_accounts_updated_at BEFORE INSERT OR UPDATE ON auth.telegram_accounts
    FOR EACH ROW EXECUTE FUNCTION foundation.update_updated_at();

ALTER TABLE auth.telegram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.telegram_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_telegram_accounts ON auth.telegram_accounts
    USING (
        organization_id = current_setting('app.current_org_id', true)::uuid
        OR foundation.is_platform_user()
    );
"""

REVERSE = """
DROP POLICY IF EXISTS tenant_isolation_telegram_accounts ON auth.telegram_accounts;
ALTER TABLE auth.telegram_accounts NO FORCE ROW LEVEL SECURITY;
ALTER TABLE auth.telegram_accounts DISABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_telegram_accounts_updated_at ON auth.telegram_accounts;
"""


class Migration(migrations.Migration):
    dependencies = [
        ("auth_custom", "0006_telegram_reset"),
    ]

    operations = [
        migrations.RunSQL(sql=FORWARD, reverse_sql=REVERSE),
    ]
