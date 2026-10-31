"""アプリ1: ユーザー管理チームの API。shop_core の UserService を呼ぶだけ"""

from dependency_injector.wiring import Provide, inject
from fastapi import Depends, FastAPI
from pydantic import BaseModel

from shop_core import Container, DomainError, NotFoundError, UserService

container = Container()

app = FastAPI(title="app1: users")


class RegisterIn(BaseModel):
    email: str
    name: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str


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


@app.exception_handler(DomainError)
def domain_error(_, exc: DomainError):
    from fastapi.responses import JSONResponse

    status = 404 if isinstance(exc, NotFoundError) else 409
    return JSONResponse({"detail": str(exc)}, status_code=status)


container.wire(modules=[__name__])
