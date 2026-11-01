"""基盤チームが配る共有ライブラリ。アプリチームはこの名前空間だけ import すればよい"""

from shop_core.container import Container
from shop_core.infra.database import Database, Notification
from shop_core.domain import (
    DomainError,
    EmptyOrderError,
    InsufficientStockError,
    InvalidProductError,
    InvalidQuantityError,
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
from shop_core.views import OrderSummary, ProductStock

__all__ = [
    "Container",
    "Database",
    "DomainError",
    "EmptyOrderError",
    "InsufficientStockError",
    "InvalidProductError",
    "InvalidQuantityError",
    "NotFoundError",
    "Notification",
    "Order",
    "OrderLine",
    "OrderService",
    "OrderSummary",
    "Product",
    "ProductNotFoundError",
    "ProductService",
    "ProductStock",
    "Settings",
    "SettingsError",
    "User",
    "UserNotFoundError",
    "UserService",
]
