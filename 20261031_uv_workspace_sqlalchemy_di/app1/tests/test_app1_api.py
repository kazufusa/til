"""app1 のテスト。DB は使わず、shop_core.testing のフェイクに差し替える"""

import pytest
from dependency_injector import providers
from fastapi.testclient import TestClient

from app1.main import app, container
from shop_core.testing import FakeUnitOfWork, InMemoryState


@pytest.fixture
def client():
    with container.uow.override(providers.Factory(FakeUnitOfWork, state=InMemoryState())):
        yield TestClient(app)


def test_register_and_get(client):
    r = client.post("/users", json={"email": "a@example.com", "name": "A"})
    assert r.status_code == 201
    uid = r.json()["id"]
    assert client.get(f"/users/{uid}").json()["email"] == "a@example.com"


def test_not_found(client):
    assert client.get("/users/999").status_code == 404
