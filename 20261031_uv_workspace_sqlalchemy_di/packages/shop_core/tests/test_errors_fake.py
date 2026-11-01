"""エラーの分類と code を DB なしで検証する"""

import pytest
from dependency_injector import providers

from shop_core import (
    Container,
    BusinessRuleError,
    ConcurrentUpdateError,
    DependencyError,
    DomainError,
    EmptyOrderError,
    InputError,
    InsufficientStockError,
    InvalidProductError,
    InvalidQuantityError,
    NotFoundError,
    ProductNotFoundError,
    UserNotFoundError,
)
from shop_core.infra.constraints import CONSTRAINT_ERRORS
from shop_core.testing import FakeUnitOfWork, InMemoryState


@pytest.fixture
def fake_container():
    c = Container()
    c.uow.override(providers.Factory(FakeUnitOfWork, state=InMemoryState()))
    return c


@pytest.mark.parametrize(
    ("error", "category", "code"),
    [
        (UserNotFoundError(1), NotFoundError, "user_not_found"),
        (ProductNotFoundError(2), NotFoundError, "product_not_found"),
        (InvalidQuantityError(1, 0), InputError, "order_line_quantity_invalid"),
        (EmptyOrderError(), InputError, "order_lines_empty"),
        (InvalidProductError("bad"), InputError, "product_invalid"),
        (InsufficientStockError(1, 5, 2), BusinessRuleError, "product_stock_insufficient"),
        (ConcurrentUpdateError("execution", 7), BusinessRuleError, "execution_concurrent_update"),
        (DependencyError("db_unavailable", "down"), DependencyError, "db_unavailable"),
    ],
)
def test_error_code_and_category(error, category, code):
    assert isinstance(error, category)
    assert isinstance(error, DomainError)
    assert error.code == code
    assert str(error) == error.message


def test_not_found_is_input_error():
    assert issubclass(NotFoundError, InputError)


def test_only_dependency_error_is_retryable():
    assert DependencyError.retryable is True
    assert not hasattr(InputError("x", "y"), "retryable")
    assert not hasattr(BusinessRuleError("x", "y"), "retryable")


def test_messages_keep_existing_format():
    assert str(UserNotFoundError(3)) == "user 3 not found"
    assert str(InsufficientStockError(1, 5, 2)) == "product 1: requested 5, available 2"
    assert str(ConcurrentUpdateError("execution", 7)) == "execution 7 was updated concurrently"


def test_registered_constraints_produce_domain_errors():
    stock = CONSTRAINT_ERRORS["ck_products_stock_nonnegative"]()
    qty = CONSTRAINT_ERRORS["ck_order_lines_quantity_positive"]()
    assert isinstance(stock, BusinessRuleError) and stock.code == "product_stock_negative"
    assert isinstance(qty, InputError) and qty.code == "order_line_quantity_invalid"


def test_register_is_idempotent(fake_container):
    svc = fake_container.user_service()
    first = svc.register("a@example.com", "A")
    second = svc.register("a@example.com", "Other")
    assert first.id == second.id
    assert len(svc.list()) == 1
