"""アプリ1: ユーザー、商品、注文の API。shop_core のサービスを呼ぶだけ"""

from datetime import datetime

from dependency_injector.wiring import Provide, inject
from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from shop_core import (
    Container,
    DomainError,
    EmptyOrderError,
    InvalidProductError,
    InvalidQuantityError,
    NotFoundError,
    OrderService,
    ProductService,
    UserService,
)

container = Container()

app = FastAPI(title="app1: shop api")


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
@inject
def register(body: RegisterIn, svc: UserService = Depends(Provide[Container.user_service])):
    return svc.register(body.email, body.name)


@app.get("/users", response_model=list[UserOut])
@inject
def list_users(svc: UserService = Depends(Provide[Container.user_service])):
    return svc.list()


@app.get("/users/{user_id}", response_model=UserOut)
@inject
def get_user(user_id: int, svc: UserService = Depends(Provide[Container.user_service])):
    return svc.get(user_id)


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
    if isinstance(exc, NotFoundError):
        status = 404
    elif isinstance(exc, (InvalidQuantityError, EmptyOrderError, InvalidProductError)):
        status = 400
    else:
        status = 409
    return JSONResponse({"detail": str(exc)}, status_code=status)


container.wire(modules=[__name__])
