"""The per-test database reset itself (common/test_isolation.py)."""

import uuid

import pytest
from django.db import connections
from django.db import transaction as db_transaction

from billing.models import SubscriptionPlan
from common.context import apply_org_context
from common.test_isolation import PollutedTestDatabase, SeedSnapshot
from foundation.models import Organization

pytestmark = pytest.mark.django_db(databases=["default", "auth_bypass_rls"], transaction=True)

BYPASS_ALIAS = "auth_bypass_rls"


def _make_org():
    org_id = uuid.uuid4()
    with db_transaction.atomic():
        apply_org_context(str(org_id))
        return Organization.objects.using(BYPASS_ALIAS).create(
            id=org_id, name="Isolation Academy", slug=f"isolation-{org_id.hex[:8]}",
            email="contact@isolation.example",
        )


def _count(table):
    with connections[BYPASS_ALIAS].cursor() as cursor:
        cursor.execute(f"SELECT count(*) FROM {table}")
        return cursor.fetchone()[0]


def _differs_from_seed(schema, table):
    """Compares every column but updated_at, which the BEFORE INSERT trigger
    stamps with the refill time."""
    with connections[BYPASS_ALIAS].cursor() as cursor:
        cursor.execute(
            "SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) "
            "FROM information_schema.columns "
            "WHERE table_schema = %s AND table_name = %s AND column_name <> 'updated_at'",
            [schema, table],
        )
        columns = cursor.fetchone()[0]
        live = f'SELECT {columns} FROM "{schema}"."{table}"'
        seed = f'SELECT {columns} FROM "test_seed"."{schema}__{table}"'
        cursor.execute(f"SELECT EXISTS (({live} EXCEPT {seed}) UNION ({seed} EXCEPT {live}))")
        return cursor.fetchone()[0]


def test_reset_empties_tenant_tables_and_restores_seeded_rows(seed_snapshot):
    assert ("billing", "subscription_plans") in seed_snapshot.seeded
    _make_org()
    SubscriptionPlan.objects.using(BYPASS_ALIAS).create(name="Extra", slug="extra-plan", price="1.00")
    with connections[BYPASS_ALIAS].cursor() as cursor:
        cursor.execute("UPDATE billing.subscription_plans SET price = price + 1 WHERE slug <> 'extra-plan'")
    assert _count('"foundation"."organizations"') == 1

    seed_snapshot.reset()

    assert _count('"foundation"."organizations"') == 0
    assert _count('"foundation"."roles"') == 0
    for schema, table in seed_snapshot.seeded:
        assert not _differs_from_seed(schema, table)


def test_snapshot_refuses_a_database_holding_tenant_rows(seed_snapshot):
    _make_org()

    with pytest.raises(PollutedTestDatabase):
        SeedSnapshot._build(seed_snapshot.tables, "fingerprint-never-stored")
