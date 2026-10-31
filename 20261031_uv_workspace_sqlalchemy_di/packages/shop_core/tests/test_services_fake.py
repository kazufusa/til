"""DB なしでサービスのルールを検証する"""

import pytest
from dependency_injector import providers

from shop_core import Container, InsufficientStockError, UserNotFoundError
from shop_core.testing import FakeUnitOfWork, InMemoryState


@pytest.fixture
def container():
    c = Container()
    c.uow.override(providers.Factory(FakeUnitOfWork, state=InMemoryState()))
    return c


def test_place_order_reserves_stock(container):
    user = container.user_service().register("a@example.com", "A")
    pen = container.product_service().add("pen", 100, 5)
    order = container.order_service().place(user.id, [(pen.id, 3)])
    assert order.total == 300
    assert container.product_service().list()[0].stock == 2


def test_insufficient_stock_rolls_back_everything(container):
    user = container.user_service().register("a@example.com", "A")
    pen = container.product_service().add("pen", 100, 1)
    ink = container.product_service().add("ink", 50, 10)
    with pytest.raises(InsufficientStockError):
        container.order_service().place(user.id, [(ink.id, 2), (pen.id, 2)])
    # ink の引き当ても commit されていない
    assert {p.name: p.stock for p in container.product_service().list()} == {"pen": 1, "ink": 10}
    assert container.order_service().list_by_user(user.id) == []


def test_unknown_user(container):
    with pytest.raises(UserNotFoundError):
        container.order_service().place(999, [])
