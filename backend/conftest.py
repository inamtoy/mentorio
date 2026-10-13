import pytest

from common.test_isolation import SeedSnapshot

_snapshot: SeedSnapshot | None = None


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    global _snapshot
    with django_db_blocker.unblock():
        _snapshot = SeedSnapshot.prepare()


def _is_transactional(request) -> bool:
    if "transactional_db" in request.fixturenames or "live_server" in request.fixturenames:
        return True
    marker = request.node.get_closest_marker("django_db")
    return bool(marker and marker.kwargs.get("transaction"))


@pytest.fixture(autouse=True)
def _reset_db_after_transactional_test(request, django_db_blocker):
    """Django's own flush misses every schema-qualified table — see
    common/test_isolation.py. Non-transactional tests are rolled back
    instead, so they need nothing here."""
    yield
    if _snapshot is not None and _is_transactional(request):
        with django_db_blocker.unblock():
            _snapshot.reset()


@pytest.fixture
def seed_snapshot(django_db_setup) -> SeedSnapshot:
    assert _snapshot is not None
    return _snapshot
