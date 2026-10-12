from django.db import migrations

# auth.telegram_chat_states has no organization (see TelegramChatState's
# docstring) and is only ever read through the auth_bypass_rls connection.
# RLS with a platform-only policy keeps the regular app role out of it.
FORWARD = """
ALTER TABLE auth.telegram_chat_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.telegram_chat_states FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_only_telegram_chat_states ON auth.telegram_chat_states
    USING (foundation.is_platform_user());
"""

REVERSE = """
DROP POLICY IF EXISTS platform_only_telegram_chat_states ON auth.telegram_chat_states;
ALTER TABLE auth.telegram_chat_states NO FORCE ROW LEVEL SECURITY;
ALTER TABLE auth.telegram_chat_states DISABLE ROW LEVEL SECURITY;
"""


class Migration(migrations.Migration):
    dependencies = [
        ("auth_custom", "0008_telegram_notifications"),
    ]

    operations = [
        migrations.RunSQL(sql=FORWARD, reverse_sql=REVERSE),
    ]
