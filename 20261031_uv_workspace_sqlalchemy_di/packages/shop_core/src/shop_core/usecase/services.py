"""ユースケースサービス。アプリチームが呼ぶ入口はここだけ。

1 メソッド = 1 トランザクション。中で UoW を開いて閉じるので、
呼ぶ側は commit も rollback も書かない。
"""

from collections.abc import Callable

from shop_core.domain.errors import (
    EmptyOrderError,
    InvalidProductError,
    ProductNotFoundError,
    UserNotFoundError,
)
from shop_core.domain.models import Order, OrderLine, Product, User
from shop_core.usecase.uow import UnitOfWork

UowFactory = Callable[[], UnitOfWork]


class UserService:
    def __init__(self, uow: UowFactory) -> None:
        self._uow = uow

    def register(self, email: str, name: str) -> User:
        with self._uow() as uow:
            existing = uow.users.resolve_by_email(email)
            if existing is not None:
                return existing
            user = uow.users.store(User(id=None, email=email, name=name))
            uow.commit()
            return user

    def get(self, user_id: int) -> User:
        with self._uow() as uow:
            user = uow.users.resolve_by_id(user_id)
            if user is None:
                raise UserNotFoundError(user_id)
            return user

    def list(self) -> list[User]:
        with self._uow() as uow:
            return uow.users.resolve_all()


class ProductService:
    def __init__(self, uow: UowFactory) -> None:
        self._uow = uow

    def add(self, name: str, price: int, stock: int) -> Product:
        if price < 0:
            raise InvalidProductError(f"price must not be negative, got {price}")
        if stock < 0:
            raise InvalidProductError(f"stock must not be negative, got {stock}")
        with self._uow() as uow:
            product = uow.products.store(Product(id=None, name=name, price=price, stock=stock))
            uow.commit()
            return product

    def list(self) -> list[Product]:
        with self._uow() as uow:
            return uow.products.resolve_all()


class OrderService:
    def __init__(self, uow: UowFactory) -> None:
        self._uow = uow

    def place(self, user_id: int, items: list[tuple[int, int]]) -> Order:
        """items は (product_id, quantity) の列。在庫引き当てと注文作成を 1 トランザクションで行う"""
        with self._uow() as uow:
            if uow.users.resolve_by_id(user_id) is None:
                raise UserNotFoundError(user_id)
            if not items:
                raise EmptyOrderError()
            # 同時注文でデッドロックしないよう、行ロックは商品 id の昇順で取る。
            # order.lines は呼び出し側の順序のまま残す
            reserved: dict[int, Product] = {}
            for product_id in sorted({pid for pid, _ in items}):
                product = uow.products.resolve_by_id_for_update(product_id)
                if product is None:
                    raise ProductNotFoundError(product_id)
                reserved[product_id] = product
            lines: list[OrderLine] = []
            for product_id, quantity in items:
                product = reserved[product_id]
                product.reserve(quantity)
                lines.append(
                    OrderLine(product_id=product_id, quantity=quantity, unit_price=product.price)
                )
            for product in reserved.values():
                uow.products.store(product)
            order = uow.orders.store(Order(id=None, user_id=user_id, lines=lines))
            uow.commit()
            return order

    def list_by_user(self, user_id: int) -> list[Order]:
        with self._uow() as uow:
            return uow.orders.resolve_by_user_id(user_id)
