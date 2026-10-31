"""app2 のテスト。ユーザーは app1 の責務だが、フェイクの state に直接積んでおく"""

import pytest
from fastapi.testclient import TestClient

from app2.main import app, container
from shop_core import User
from shop_core.testing import InMemoryState, fake_backend


@pytest.fixture
def state():
    st = InMemoryState()
    st.users[st.next_id()] = User(id=1, email="a@example.com", name="A")
    return st


@pytest.fixture
def client(state):
    with fake_backend(container, state):
        yield TestClient(app)


def test_place_order(client):
    pen = client.post("/products", json={"name": "pen", "price": 100, "stock": 5}).json()
    r = client.post("/orders", json={"user_id": 1, "items": [{"product_id": pen["id"], "quantity": 2}]})
    assert r.status_code == 201
    assert r.json()["total"] == 200
    assert client.get("/products").json()[0]["stock"] == 3


def test_insufficient_stock_is_409(client):
    pen = client.post("/products", json={"name": "pen", "price": 100, "stock": 1}).json()
    r = client.post("/orders", json={"user_id": 1, "items": [{"product_id": pen["id"], "quantity": 2}]})
    assert r.status_code == 409
    assert client.get("/products").json()[0]["stock"] == 1
