import pytest

from shop_core import Container
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
