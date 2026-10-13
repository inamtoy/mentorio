"""Reset the test database between `transaction=True` tests.

Django's flush after a transactional test only truncates tables it can match
by name, and `connection.introspection.django_table_names()` returns the bare
model `db_table` strings. Every app table here is schema-qualified
(`'"foundation"."organizations"'`, see common.db.schema_table), so none of
them match and flush only ever truncated the handful of `public` tables. Rows
from every test leaked into every later test, and across `--reuse-db` runs.

Emptying every app table would also wipe the rows migrations seed (the
permission catalog, subscription plans), which tests rely on. So:

1. Right after migrate, every non-empty app table is copied into a
   `test_seed` schema, together with a fingerprint of the applied migrations.
   The copy is rebuilt whenever that fingerprint changes (a new migration
   ran under `--reuse-db`) and is dropped with the database on `--create-db`.
   The database is also reset once per session, which clears whatever an
   interrupted earlier run left behind.
2. After each transactional test, every app table holding rows is emptied
   and the seeded ones are refilled from `test_seed`.

Refilled seed rows keep every column except `updated_at`: the BEFORE INSERT
trigger stamps it with the refill time, and disabling triggers needs more
than the test roles have.

The reset uses DELETE, not TRUNCATE: TRUNCATE recreates each table's files
and costs ~1s per test across ~50 tables, while these tables only ever hold
a few test rows. It runs on `auth_bypass_rls`, because FORCE ROW LEVEL
SECURITY would hide every row from educore_app outside an org context.
"""

import hashlib

from django.db import connections, transaction

OWNER_ALIAS = "default"
BYPASS_ALIAS = "auth_bypass_rls"
SEED_SCHEMA = "test_seed"
META_TABLE = f'"{SEED_SCHEMA}"."_meta"'
SEEDED_TABLES_TABLE = f'"{SEED_SCHEMA}"."_seeded_tables"'

# Tenant data never comes from migrations. If these hold rows when a new
# snapshot is about to be taken, the database is left over from an older
# run and its rows would be frozen in as "seed" for every test.
TENANT_SENTINEL_TABLES = [("foundation", "organizations"), ("foundation", "users")]

_EXCLUDED_SCHEMAS = ("public", "information_schema", SEED_SCHEMA)

Table = tuple[str, str]


class PollutedTestDatabase(RuntimeError):
    pass


def _quote(schema: str, table: str) -> str:
    return f'"{schema}"."{table}"'


def _seed_copy_name(schema: str, table: str) -> str:
    return _quote(SEED_SCHEMA, f"{schema}__{table}")


def _app_tables(cursor) -> list[Table]:
    cursor.execute(
        """
        SELECT n.nspname, c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p')
          AND NOT c.relispartition
          AND n.nspname NOT LIKE 'pg\\_%%'
          AND n.nspname <> ALL(%s)
        ORDER BY 1, 2
        """,
        [list(_EXCLUDED_SCHEMAS)],
    )
    return cursor.fetchall()


def _non_empty(cursor, tables: list[Table]) -> list[Table]:
    if not tables:
        return []
    query = " UNION ALL ".join(
        f"SELECT {i} WHERE EXISTS (SELECT 1 FROM {_quote(s, t)})" for i, (s, t) in enumerate(tables)
    )
    cursor.execute(query)
    return [tables[row[0]] for row in cursor.fetchall()]


def _migrations_fingerprint(cursor) -> str:
    cursor.execute("SELECT app, name FROM django_migrations ORDER BY app, name")
    return hashlib.sha256(repr(cursor.fetchall()).encode()).hexdigest()


def _dependency_order(cursor, tables: list[Table]) -> list[Table]:
    """`tables` ordered so every FK target comes before the tables that
    reference it: the insert order, and reversed, the delete order."""
    cursor.execute(
        """
        SELECT sn.nspname, sc.relname, tn.nspname, tc.relname
        FROM pg_constraint k
        JOIN pg_class sc ON sc.oid = k.conrelid
        JOIN pg_namespace sn ON sn.oid = sc.relnamespace
        JOIN pg_class tc ON tc.oid = k.confrelid
        JOIN pg_namespace tn ON tn.oid = tc.relnamespace
        WHERE k.contype = 'f'
        """
    )
    depends_on: dict[Table, set[Table]] = {table: set() for table in tables}
    for s_schema, s_table, t_schema, t_table in cursor.fetchall():
        source, target = (s_schema, s_table), (t_schema, t_table)
        if source in depends_on and target in depends_on and source != target:
            depends_on[source].add(target)

    ordered: list[Table] = []
    while depends_on:
        done = set(ordered)
        ready = sorted(t for t, deps in depends_on.items() if deps <= done)
        # An FK cycle: the constraints are deferred during a reset, so any
        # order works for what is left.
        for table in ready or sorted(depends_on):
            ordered.append(table)
            del depends_on[table]
    return ordered


class SeedSnapshot:
    def __init__(self, tables: list[Table], seeded: list[Table]):
        self.tables = tables  # dependency order
        self.seeded = [t for t in tables if t in set(seeded)]

    @classmethod
    def prepare(cls) -> "SeedSnapshot":
        """Load the snapshot, (re)building it if migrations changed, then
        reset the database to it."""
        with connections[OWNER_ALIAS].cursor() as cursor:
            fingerprint = _migrations_fingerprint(cursor)
            cursor.execute("SELECT to_regclass(%s)", [META_TABLE])
            stored = None
            if cursor.fetchone()[0] is not None:
                cursor.execute(f"SELECT fingerprint FROM {META_TABLE}")
                row = cursor.fetchone()
                stored = row[0] if row else None

        with connections[BYPASS_ALIAS].cursor() as cursor:
            tables = _dependency_order(cursor, _app_tables(cursor))

        if stored != fingerprint:
            cls._build(tables, fingerprint)

        with connections[OWNER_ALIAS].cursor() as cursor:
            cursor.execute(f"SELECT schema_name, table_name FROM {SEEDED_TABLES_TABLE}")
            seeded = [tuple(row) for row in cursor.fetchall()]

        snapshot = cls(tables, seeded)
        snapshot.reset()
        return snapshot

    @staticmethod
    def _build(tables: list[Table], fingerprint: str) -> None:
        with connections[BYPASS_ALIAS].cursor() as cursor:
            polluted = _non_empty(cursor, TENANT_SENTINEL_TABLES)
            if polluted:
                raise PollutedTestDatabase(
                    "The test database already holds tenant rows "
                    f"({', '.join(_quote(*t) for t in polluted)}), so its contents can't be "
                    "snapshotted as migration seed data. It is left over from a run before "
                    "test isolation existed, or from a run that was killed mid-test. "
                    "Rebuild it once with `pytest --create-db`."
                )
            seeded = _non_empty(cursor, tables)

        with connections[OWNER_ALIAS].cursor() as cursor, transaction.atomic(using=OWNER_ALIAS):
            cursor.execute(f'DROP SCHEMA IF EXISTS "{SEED_SCHEMA}" CASCADE')
            cursor.execute(f'CREATE SCHEMA "{SEED_SCHEMA}"')
            cursor.execute(f"CREATE TABLE {META_TABLE} (fingerprint text NOT NULL)")
            cursor.execute(
                f"CREATE TABLE {SEEDED_TABLES_TABLE} (schema_name text NOT NULL, table_name text NOT NULL)"
            )
            cursor.execute(f"INSERT INTO {META_TABLE} VALUES (%s)", [fingerprint])
            for schema, table in seeded:
                cursor.execute(f"INSERT INTO {SEEDED_TABLES_TABLE} VALUES (%s, %s)", [schema, table])
                # Same columns in the same order, so `SELECT *` copies both ways.
                cursor.execute(
                    f"CREATE TABLE {_seed_copy_name(schema, table)} (LIKE {_quote(schema, table)})"
                )

        # Filled through the RLS-bypassing role: as educore_app, FORCE RLS
        # would hide the rows being copied.
        with connections[BYPASS_ALIAS].cursor() as cursor, transaction.atomic(using=BYPASS_ALIAS):
            for schema, table in seeded:
                cursor.execute(
                    f"INSERT INTO {_seed_copy_name(schema, table)} SELECT * FROM {_quote(schema, table)}"
                )

    def reset(self) -> None:
        with connections[BYPASS_ALIAS].cursor() as cursor, transaction.atomic(using=BYPASS_ALIAS):
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            # Seeded tables are always refilled, even when a test emptied them.
            dirty = set(_non_empty(cursor, self.tables)) | set(self.seeded)
            for table in reversed(self.tables):
                if table in dirty:
                    cursor.execute(f"DELETE FROM {_quote(*table)}")
            for schema, table in self.seeded:
                cursor.execute(
                    f"INSERT INTO {_quote(schema, table)} SELECT * FROM {_seed_copy_name(schema, table)}"
                )
