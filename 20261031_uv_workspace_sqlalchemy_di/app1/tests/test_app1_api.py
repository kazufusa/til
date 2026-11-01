"""app1 のテスト。DB は使わず、shop_core.testing のフェイクに差し替える"""

import pytest
from fastapi.testclient import TestClient

from app1.main import app, container
from shop_core.testing import InMemoryState, fake_backend


@pytest.fixture
def client():
    with fake_backend(container, InMemoryState()):
        yield TestClient(app)


def test_register_and_get(client):
    r = client.post("/users", json={"email": "a@example.com", "name": "A"})
    assert r.status_code == 201
    uid = r.json()["id"]
    assert client.get(f"/users/{uid}").json()["email"] == "a@example.com"


def test_not_found(client):
    assert client.get("/users/999").status_code == 404


def test_place_order(client):
    uid = client.post("/users", json={"email": "a@example.com", "name": "A"}).json()["id"]
    pen = client.post("/products", json={"name": "pen", "price": 100, "stock": 5}).json()
    r = client.post("/orders", json={"user_id": uid, "items": [{"product_id": pen["id"], "quantity": 2}]})
    assert r.status_code == 201
    assert r.json()["total"] == 200
    assert client.get("/products").json()[0]["stock"] == 3


def test_insufficient_stock_is_409(client):
    uid = client.post("/users", json={"email": "a@example.com", "name": "A"}).json()["id"]
    pen = client.post("/products", json={"name": "pen", "price": 100, "stock": 1}).json()
    r = client.post("/orders", json={"user_id": uid, "items": [{"product_id": pen["id"], "quantity": 2}]})
    assert r.status_code == 409
    assert client.get("/products").json()[0]["stock"] == 1
