"""FastAPI 用の Depends 部品。アプリは `from shop_core.fastapi import ...` と明示して使う。

FastAPI は shop_core の依存ではないので、shop_core/__init__ はこのモジュールを読み込まない。
FastAPI を使うアプリ(依存に fastapi を持つ)だけが import する。入っていなければ ImportError。

    from fastapi import Depends
    from shop_core.fastapi import user_service

    @app.get("/users")
    def list_users(svc: UserService = Depends(user_service)):
        return svc.list()

Container は lifespan で app.state.container に置いておく。リクエストごとの get_container が
それを返し、各サービスの依存関数が Container から取り出す。
app2 のように shop_core の Container を core 属性として持つ AppContainer を置いたときは、
core の方を返す(アプリ固有の部品は、アプリ側の依存関数で AppContainer から取る)。
"""

from __future__ import annotations

try:
    from fastapi import Depends, Request
except ImportError as exc:  # pragma: no cover - fastapi が無い環境の案内
    raise ImportError(
        "shop_core.fastapi needs fastapi; add it to the application's dependencies"
    ) from exc

from shop_core.container import Container
from shop_core.domain.ports import ImageStore
from shop_core.usecase.async_support import AsyncTransactionScope
from shop_core.usecase.services import ExecutionService, OrderService, ProductService, UserService
from shop_core.usecase.transaction import TransactionScope

__all__ = [
    "execution_service",
    "get_container",
    "image_store",
    "order_service",
    "product_service",
    "transaction",
    "transaction_async",
    "user_service",
]


def get_container(request: Request) -> Container:
    """app.state.container の shop_core の Container。AppContainer のときは core"""
    container = request.app.state.container
    return getattr(container, "core", container)


def user_service(c: Container = Depends(get_container)) -> UserService:
    return c.user_service()


def product_service(c: Container = Depends(get_container)) -> ProductService:
    return c.product_service()


def order_service(c: Container = Depends(get_container)) -> OrderService:
    return c.order_service()


def execution_service(c: Container = Depends(get_container)) -> ExecutionService:
    return c.execution_service()


def image_store(c: Container = Depends(get_container)) -> ImageStore:
    return c.image_store()


def transaction(c: Container = Depends(get_container)) -> TransactionScope:
    """リクエストごとに新しいスコープ。`with scope as tx:` で使う"""
    return c.transaction()


def transaction_async(c: Container = Depends(get_container)) -> AsyncTransactionScope:
    """リクエストごとに新しいスコープ。`async with scope as tx:` で使う"""
    return c.transaction_async()
