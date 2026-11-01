"""ドメインモデル。SQLAlchemy に依存しない素の dataclass"""

from dataclasses import dataclass, field
from datetime import datetime

from shop_core.domain.errors import InsufficientStockError, InvalidQuantityError


@dataclass
class User:
    id: int | None
    email: str
    name: str


@dataclass
class Product:
    id: int | None
    name: str
    price: int
    stock: int

    def reserve(self, quantity: int) -> None:
        if quantity <= 0:
            raise InvalidQuantityError(self.id or 0, quantity)
        if quantity > self.stock:
            raise InsufficientStockError(self.id or 0, quantity, self.stock)
        self.stock -= quantity


@dataclass
class OrderLine:
    product_id: int
    quantity: int
    unit_price: int

    @property
    def subtotal(self) -> int:
        return self.quantity * self.unit_price


@dataclass
class Order:
    id: int | None
    user_id: int
    lines: list[OrderLine] = field(default_factory=list)
    created_at: datetime | None = None

    @property
    def total(self) -> int:
        return sum(line.subtotal for line in self.lines)
