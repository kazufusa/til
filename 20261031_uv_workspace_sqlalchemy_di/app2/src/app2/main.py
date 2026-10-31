"""アプリ2: 注文チームの API。shop_core の ProductService / OrderService を呼ぶだけ"""

from datetime import datetime

from dependency_injector.wiring import Provide, inject
from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from shop_core import Container, DomainError, NotFoundError, OrderService, ProductService

container = Container()

app = FastAPI(title="app2: orders")


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


@app.post("/products", response_model=ProductOut, status_code=201)
@inject
def add_product(body: ProductIn, svc: ProductService = Depends(Provide[Container.product_service])):
    return svc.add(body.name, body.price, body.stock)


@app.get("/products", response_model=list[ProductOut])
@inject
def list_products(svc: ProductService = Depends(Provide[Container.product_service])):
    return svc.list()


@app.post("/orders", response_model=OrderOut, status_code=201)
@inject
def place_order(body: OrderIn, svc: OrderService = Depends(Provide[Container.order_service])):
    return svc.place(body.user_id, [(i.product_id, i.quantity) for i in body.items])


@app.get("/users/{user_id}/orders", response_model=list[OrderOut])
@inject
def list_orders(user_id: int, svc: OrderService = Depends(Provide[Container.order_service])):
    return svc.list_by_user(user_id)


@app.exception_handler(DomainError)
def domain_error(_, exc: DomainError):
    status = 404 if isinstance(exc, NotFoundError) else 409
    return JSONResponse({"detail": str(exc)}, status_code=status)


container.wire(modules=[__name__])
