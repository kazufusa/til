"""アプリ1: ユーザー、商品、注文の API。shop_core のサービスを呼ぶだけ"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from uuid import UUID

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from shop_core import (
    BusinessRuleError,
    DependencyError,
    DomainError,
    EventPublishError,
    InputError,
    ExecutionService,
    NotFoundError,
    OrderService,
    ProductService,
    UserService,
    build_container,
    check_database,
    check_image_store,
)
from shop_core.fastapi import (
    execution_service,
    image_store,
    order_service,
    product_service,
    user_service,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """起動時に Container を作って検査し、app.state に置く。終了時に片付ける。

    Container はここでだけ作り、app.state に置く。モジュールのグローバルには持たない
    """
    container = build_container()
    check_database(container)
    check_image_store(container)
    app.state.container = container
    try:
        yield
    finally:
        container.engine().dispose()


app = FastAPI(title="app1: shop api", lifespan=lifespan)


class RegisterIn(BaseModel):
    email: str
    name: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str


class ProductIn(BaseModel):
    name: str
    price: int
    stock: int


class ProductOut(ProductIn):
    id: int


class OrderItemIn(BaseModel):
    product_id: int
    quantity: int


class OrderIn(BaseModel):
    user_id: int
    items: list[OrderItemIn]


class OrderLineOut(BaseModel):
    product_id: int
    quantity: int
    unit_price: int


class OrderOut(BaseModel):
    id: int
    user_id: int
    lines: list[OrderLineOut]
    total: int
    created_at: datetime


@app.post("/users", response_model=UserOut, status_code=201)
def register(body: RegisterIn, svc: UserService = Depends(user_service)):
    return svc.register(body.email, body.name)


@app.get("/users", response_model=list[UserOut])
def list_users(svc: UserService = Depends(user_service)):
    return svc.list()


@app.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, svc: UserService = Depends(user_service)):
    return svc.get(user_id)


@app.post("/products", response_model=ProductOut, status_code=201)
def add_product(body: ProductIn, svc: ProductService = Depends(product_service)):
    return svc.add(body.name, body.price, body.stock)


@app.get("/products", response_model=list[ProductOut])
def list_products(svc: ProductService = Depends(product_service)):
    return svc.list()


@app.post("/orders", response_model=OrderOut, status_code=201)
def place_order(body: OrderIn, svc: OrderService = Depends(order_service)):
    return svc.place(body.user_id, [(i.product_id, i.quantity) for i in body.items])


@app.get("/users/{user_id}/orders", response_model=list[OrderOut])
def list_orders(user_id: int, svc: OrderService = Depends(order_service)):
    return svc.list_by_user(user_id)


class ImageOut(BaseModel):
    id: UUID
    url: str  # 署名付き GET URL(15 分有効)


class ExecutionOut(BaseModel):
    id: UUID
    order_id: int
    status: str
    failure_reason: str | None
    created_at: datetime
    images: list[ImageOut]


class CompleteIn(BaseModel):
    image_ids: list[UUID]


def _execution_out(execution, store) -> ExecutionOut:
    return ExecutionOut(
        id=execution.id,
        order_id=execution.order_id,
        status=execution.status,
        failure_reason=execution.failure_reason,
        created_at=execution.created_at,
        images=[
            ImageOut(id=i.id, url=store.presigned_get_url(execution, i.id))
            for i in execution.images
        ],
    )


@app.post("/orders/{order_id}/executions", response_model=ExecutionOut, status_code=201)
def start_execution(
    order_id: int,
    svc: ExecutionService = Depends(execution_service),
    store=Depends(image_store),
):
    return _execution_out(svc.start(order_id), store)


@app.post("/executions/{execution_id}/complete", response_model=ExecutionOut)
def complete_execution(
    execution_id: UUID,
    body: CompleteIn,
    svc: ExecutionService = Depends(execution_service),
    store=Depends(image_store),
):
    return _execution_out(svc.complete(execution_id, body.image_ids), store)


@app.get("/executions/{execution_id}", response_model=ExecutionOut)
def get_execution(
    execution_id: UUID,
    svc: ExecutionService = Depends(execution_service),
    store=Depends(image_store),
):
    return _execution_out(svc.get(execution_id), store)


@app.exception_handler(DomainError)
def domain_error(_, exc: DomainError):
    if isinstance(exc, NotFoundError):
        status = 404
    elif isinstance(exc, InputError):
        status = 400
    elif isinstance(exc, BusinessRuleError):
        status = 409
    elif isinstance(exc, DependencyError):
        status = 503
    else:
        status = 500
    return JSONResponse({"code": exc.code, "detail": str(exc)}, status_code=status)


@app.exception_handler(EventPublishError)
def event_publish_error(_, exc: EventPublishError):
    """書き込みは確定済みでイベントだけ送れなかった。DomainError ではないので別に受ける。

    クライアントが同じリクエストをやり直すと二重に書くことになるため、detail でそれを伝える
    """
    return JSONResponse(
        {"code": "event_publish_failed", "detail": str(exc)},
        status_code=500,
    )
