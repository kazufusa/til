"""DB なしでサービスのルールを検証する"""

import pytest
from dependency_injector import providers

from shop_core import (
    Container,
    EmptyOrderError,
    InsufficientStockError,
    InvalidProductError,
    InvalidQuantityError,
    UserNotFoundError,
)
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
        container.order_service().place(999, [(1, 1)])


@pytest.mark.parametrize("quantity", [0, -1])
def test_non_positive_quantity_rejected(container, quantity):
    user = container.user_service().register("a@example.com", "A")
    pen = container.product_service().add("pen", 100, 5)
    with pytest.raises(InvalidQuantityError):
        container.order_service().place(user.id, [(pen.id, quantity)])
    assert container.product_service().list()[0].stock == 5
    assert container.order_service().list_by_user(user.id) == []


def test_empty_order_rejected(container):
    user = container.user_service().register("a@example.com", "A")
    with pytest.raises(EmptyOrderError):
        container.order_service().place(user.id, [])


@pytest.mark.parametrize("price, stock", [(100, -1), (-1, 5)])
def test_add_negative_values_rejected(container, price, stock):
    with pytest.raises(InvalidProductError):
        container.product_service().add("pen", price, stock)
    assert container.product_service().list() == []


def test_order_lines_keep_input_order(container):
    user = container.user_service().register("a@example.com", "A")
    a = container.product_service().add("a", 10, 5)
    b = container.product_service().add("b", 20, 5)
    order = container.order_service().place(user.id, [(b.id, 1), (a.id, 2)])
    assert [line.product_id for line in order.lines] == [b.id, a.id]
