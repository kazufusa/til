"""app2 のテスト。DB と Slack はフェイクに差し替える"""

from urllib.parse import urlencode

import pytest
from dependency_injector import providers
from fastapi.testclient import TestClient

from app2.main import app, container
from shop_core.testing import InMemoryState, fake_backend


class FakeSlackClient:
    def __init__(self):
        self.posts: list[dict] = []

    def chat_postMessage(self, **kwargs):
        self.posts.append(kwargs)


class StubVerifier:
    def __init__(self, valid: bool):
        self.valid = valid

    def is_valid_request(self, body, headers) -> bool:
        return self.valid


@pytest.fixture
def state():
    return InMemoryState()


@pytest.fixture
def slack():
    return FakeSlackClient()


@pytest.fixture
def client(state, slack, monkeypatch):
    # フェイクの transaction に session はないので、リンクの表を触る関数は差し替える
    def fake_resolve(tx, users, slack_user_id, user_name):
        return users.register(email=f"{slack_user_id}@slack.local", name=user_name).id

    monkeypatch.setattr("app2.main.resolve_user_id", fake_resolve)
    with (
        fake_backend(container.core, state),
        container.slack_client.override(providers.Object(slack)),
        container.verifier.override(providers.Object(StubVerifier(True))),
    ):
        yield TestClient(app)


def _command(client, text: str):
    data = {"user_id": "U1", "user_name": "alice", "channel_id": "C1", "text": text}
    return client.post(
        "/slack/commands",
        content=urlencode(data),
        headers={"content-type": "application/x-www-form-urlencoded"},
    )


def _add_product(stock: int) -> int:
    return container.core.product_service().add("pen", 100, stock).id


def test_url_verification_echoes_challenge(client):
    r = client.post("/slack/events", json={"type": "url_verification", "challenge": "abc"})
    assert r.status_code == 200
    assert r.json() == {"challenge": "abc"}


def test_other_event_is_acknowledged(client):
    r = client.post("/slack/events", json={"type": "event_callback"})
    assert r.json() == {"ok": True}


def test_command_places_order_and_posts(client, slack):
    pid = _add_product(5)
    r = _command(client, f"{pid} 2")
    assert r.status_code == 200
    body = r.json()
    assert body["response_type"] == "ephemeral"
    assert "注文" in body["text"]
    assert len(slack.posts) == 1
    assert slack.posts[0]["channel"] == "C1"
    assert "200 円" in slack.posts[0]["text"]


def test_command_text_contains_order_id(client, state):
    pid = _add_product(5)
    r = _command(client, f"{pid} 1")
    (order_id,) = state.orders
    assert f"注文 {order_id} " in r.json()["text"]


def test_slack_failure_does_not_fail_order(client, state, slack):
    from slack_sdk.errors import SlackApiError

    def boom(**kwargs):
        raise SlackApiError("down", {"ok": False})

    slack.chat_postMessage = boom
    pid = _add_product(5)
    r = _command(client, f"{pid} 1")
    assert r.status_code == 200
    assert len(state.orders) == 1


def test_insufficient_stock_is_ephemeral_200(client, slack):
    pid = _add_product(1)
    r = _command(client, f"{pid} 2")
    assert r.status_code == 200
    assert r.json()["response_type"] == "ephemeral"
    assert "requested 2, available 1" in r.json()["text"]
    assert slack.posts == []


def test_bad_text_returns_usage(client, slack):
    r = _command(client, "abc")
    assert r.status_code == 200
    assert "使い方" in r.json()["text"]
    assert slack.posts == []


def test_same_command_twice_registers_one_user(client, state):
    pid = _add_product(5)
    _command(client, f"{pid} 1")
    _command(client, f"{pid} 1")
    assert len(state.users) == 1
    assert len(state.orders) == 2


def test_invalid_signature_is_401(state, slack):
    with (
        fake_backend(container.core, state),
        container.slack_client.override(providers.Object(slack)),
        container.verifier.override(providers.Object(StubVerifier(False))),
    ):
        c = TestClient(app)
        assert c.post("/slack/events", json={"type": "url_verification", "challenge": "x"}).status_code == 401
        assert _command(c, "1 1").status_code == 401
    assert slack.posts == []
