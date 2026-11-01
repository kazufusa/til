"""shop_core.fastapi: 明示的に import したときだけ読み込まれ、Container の部品を Depends で渡す"""

import subprocess
import sys

import pytest

pytest.importorskip("fastapi")

from fastapi import Depends, FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from shop_core import Container  # noqa: E402
from shop_core.fastapi import (  # noqa: E402
    execution_service,
    get_container,
    image_store,
    order_service,
    product_service,
    transaction,
    transaction_async,
    user_service,
)
from shop_core.testing import InMemoryState, fake_backend  # noqa: E402


def test_importing_shop_core_does_not_import_fastapi():
    code = "import sys, shop_core; assert 'shop_core.fastapi' not in sys.modules"
    subprocess.run([sys.executable, "-c", code], check=True)


def test_dependencies_resolve_from_app_state():
    app = FastAPI()
    container = Container()
    app.state.container = container

    @app.get("/probe")
    def probe(
        c=Depends(get_container),
        u=Depends(user_service),
        p=Depends(product_service),
        o=Depends(order_service),
        e=Depends(execution_service),
        s=Depends(image_store),
        t=Depends(transaction),
        ta=Depends(transaction_async),
    ):
        return {
            "container": c is container,
            "user": u is container.user_service(),
            "product": p is container.product_service(),
            "order": o is container.order_service(),
            "execution": e is container.execution_service(),
            "scopes": type(t).__name__ + "," + type(ta).__name__,
        }

    with fake_backend(container, InMemoryState()):
        body = TestClient(app).get("/probe").json()
    assert body == {
        "container": True,
        "user": True,
        "product": True,
        "order": True,
        "execution": True,
        "scopes": "FakeTransactionScope,FakeAsyncTransactionScope",
    }


def test_app_container_with_core_attribute_resolves_to_core():
    class AppContainer:
        def __init__(self, core):
            self.core = core

    app = FastAPI()
    core = Container()
    app.state.container = AppContainer(core)

    @app.get("/core")
    def probe(c=Depends(get_container)):
        return {"same": c is core}

    assert TestClient(app).get("/core").json() == {"same": True}
