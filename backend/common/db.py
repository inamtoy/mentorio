from django.db.models import CharField, Func


def schema_table(schema: str, table: str) -> str:
    """Schema-qualified, quoted table name for Meta.db_table.

    Postgres schema names like "group" collide with reserved words, and every
    table in this project lives in a named schema (not the default `public`)
    per the database/*.sql design docs — always quote both parts.
    """
    return f'"{schema}"."{table}"'


class PhoneKey(Func):
    """The last 9 digits of a free-text phone column ("+998 90 123-45-67" ->
    "901234567") — the same rule as auth_custom.services.phone.phones_match,
    as a SQL expression. Used both for the functional indexes on
    foundation.users / student.student_parents and for the lookups that hit
    them, so the two can never drift apart.
    """

    template = "right(regexp_replace(%(expressions)s, '\D', '', 'g'), 9)"
    output_field = CharField()
