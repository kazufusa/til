"""app1 のテスト。DB は使わず、shop_core.testing のフェイクに差し替える"""

import pytest
from fastapi.testclient import TestClient

from app1.main import app
from shop_core import Container, DependencyError, UserService
from shop_core.testing import InMemoryState, fake_backend


@pytest.fixture
def container():
    # lifespan は走らせない(TestClient を with で開かない)。Container はテストが作って app.state に置く
    c = Container()
    app.state.container = c
    yield c


@pytest.fixture
def client(container):
    with fake_backend(container, InMemoryState()):
        yield TestClient(app)


def test_register_and_get(client):
    r = client.post("/users", json={"email": "a@example.com", "name": "A"})
    assert r.status_code == 201
    uid = r.json()["id"]
    assert client.get(f"/users/{uid}").json()["email"] == "a@example.com"


def test_not_found(client):
    r = client.get("/users/999")
    assert r.status_code == 404
    assert r.json() == {"code": "user_not_found", "detail": "user 999 not found"}


def test_input_error_is_400(client):
    r = client.post("/products", json={"name": "pen", "price": -1, "stock": 1})
    assert r.status_code == 400
    assert r.json()["code"] == "product_invalid"


def test_dependency_error_is_503(client, monkeypatch):
    def down(self):
        raise DependencyError("db_unavailable", "database is down")

    monkeypatch.setattr(UserService, "list", down)
    r = client.get("/users")
    assert r.status_code == 503
    assert r.json() == {"code": "db_unavailable", "detail": "database is down"}


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
    assert r.json()["code"] == "product_stock_insufficient"
    assert client.get("/products").json()[0]["stock"] == 1


def test_execution_flow(client, container):
    from uuid import UUID

    from shop_core import new_id

    uid = client.post("/users", json={"email": "a@example.com", "name": "A"}).json()["id"]
    pen = client.post("/products", json={"name": "pen", "price": 100, "stock": 5}).json()
    oid = client.post(
        "/orders", json={"user_id": uid, "items": [{"product_id": pen["id"], "quantity": 1}]}
    ).json()["id"]
    r = client.post(f"/orders/{oid}/executions")
    assert r.status_code == 201
    ex = r.json()
    assert ex["status"] == "running" and "artifact_prefix" not in ex

    image_id = new_id()
    execution = container.execution_service().get(UUID(ex["id"]))
    container.image_store().put(execution, image_id, b"png", content_type="image/png")
    r = client.post(f"/executions/{ex['id']}/complete", json={"image_ids": [str(image_id)]})
    assert r.status_code == 200
    got = client.get(f"/executions/{ex['id']}").json()
    assert got["status"] == "done"
    assert got["images"][0]["id"] == str(image_id)
    assert got["images"][0]["url"].startswith("memory://")


def test_execution_not_found(client):
    assert client.post("/orders/999/executions").status_code == 404
    assert client.get("/executions/00000000-0000-7000-8000-000000000000").status_code == 404


def test_event_publish_failure_is_500_with_code_and_write_is_kept(client, container):
    class Exploding:
        def publish(self, events):
            raise ConnectionError("broker down")

    with container.override(event_publisher=lambda: Exploding()):
        r = client.post("/users", json={"email": "a@example.com", "name": "A"})
    assert r.status_code == 500
    assert r.json()["code"] == "event_publish_failed"
    # 書き込みは確定している
    assert [u["email"] for u in client.get("/users").json()] == ["a@example.com"]
