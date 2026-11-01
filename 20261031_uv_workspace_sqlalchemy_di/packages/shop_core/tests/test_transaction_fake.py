import pytest

from shop_core import Container, InsufficientStockError
from shop_core.testing import InMemoryState, fake_backend


@pytest.fixture
def state():
    return InMemoryState()


@pytest.fixture
def container(state):
    c = Container()
    with fake_backend(c, state):
        yield c


def _work(c):
    user = c.user_service().register("a@example.com", "A")
    pen = c.product_service().add("pen", 100, 5)
    order = c.order_service().place(user.id, [(pen.id, 2)])
    return user, pen, order


def test_exception_rolls_back_everything(container, state):
    with pytest.raises(RuntimeError):
        with container.transaction():
            _work(container)
            raise RuntimeError
    assert not state.users and not state.products and not state.orders


def test_success_commits_everything(container, state):
    with container.transaction():
        user, pen, _ = _work(container)
    assert container.user_service().list() == [user]
    assert container.product_service().list()[0].stock == 3
    assert len(container.order_service().list_by_user(user.id)) == 1


def test_services_see_uncommitted_writes(container, state):
    with container.transaction() as tx:
        user, pen, order = _work(container)
        assert tx.state.users[user.id].email == "a@example.com"
        assert not state.users
    assert state.users


def test_nested_scope_joins_outer(container, state):
    with pytest.raises(RuntimeError):
        with container.transaction():
            with container.transaction():
                container.user_service().register("a@example.com", "A")
            assert not state.users
            raise RuntimeError
    assert not state.users


def test_db_is_not_faked(container, monkeypatch):
    # db にフェイクはない。DATABASE_URL がなければ SettingsError になる
    from shop_core import SettingsError

    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(SettingsError):
        container.db()


def _two_products(c):
    user = c.user_service().register("a@example.com", "A")
    p1 = c.product_service().add("p1", 100, 10)
    p2 = c.product_service().add("p2", 100, 10)
    return user, p1, p2


def test_caught_exception_inside_transaction_leaves_no_partial_writes(container, state):
    user, p1, p2 = _two_products(container)
    with container.transaction():
        try:
            container.order_service().place(user.id, [(p1.id, 2), (p2.id, 999)])
        except InsufficientStockError:
            pass
    assert {p.name: p.stock for p in container.product_service().list()} == {"p1": 10, "p2": 10}
    assert state.orders == {}


def test_nested_scope_failure_does_not_leak_but_outer_commits(container, state):
    with container.transaction():
        outer_user = container.user_service().register("a@example.com", "A")
        try:
            with container.transaction():
                container.user_service().register("b@example.com", "B")
                raise RuntimeError
        except RuntimeError:
            pass
    assert [u.email for u in container.user_service().list()] == [outer_user.email]


def test_service_inside_transaction_commits_at_scope_end(container, state):
    user, p1, _ = _two_products(container)
    with container.transaction():
        container.order_service().place(user.id, [(p1.id, 2)])
        assert state.orders == {}
    assert len(state.orders) == 1
    assert state.products[p1.id].stock == 8
