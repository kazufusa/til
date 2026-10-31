"""基盤チームが配る共有ライブラリ。アプリチームはこの名前空間だけ import すればよい"""

from shop_core.container import Container
from shop_core.domain import (
    DomainError,
    InsufficientStockError,
    NotFoundError,
    Order,
    OrderLine,
    Product,
    ProductNotFoundError,
    User,
    UserNotFoundError,
)
from shop_core.settings import Settings, SettingsError
from shop_core.usecase.services import OrderService, ProductService, UserService

__all__ = [
    "Container",
    "DomainError",
    "InsufficientStockError",
    "NotFoundError",
    "Order",
    "OrderLine",
    "OrderService",
    "Product",
    "ProductNotFoundError",
    "ProductService",
    "Settings",
    "SettingsError",
    "User",
    "UserNotFoundError",
    "UserService",
]
