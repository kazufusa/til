"""Execution と ImageStore のフェイクを DB と S3 なしで検証する"""

import pytest

from shop_core import (
    ArtifactNotFoundError,
    Container,
    ExecutionNotFoundError,
    ExecutionNotRunningError,
    OrderNotFoundError,
    new_id,
)
from shop_core.testing import InMemoryImageStore, InMemoryState, fake_backend

PNG = b"\x89PNG\r\n\x1a\nfake"


@pytest.fixture
def state():
    return InMemoryState()


@pytest.fixture
def container(state):
    c = Container()
    with fake_backend(c, state):
        yield c


@pytest.fixture
def order_id(container):
    user = container.user_service().register("a@example.com", "A")
    pen = container.product_service().add("pen", 100, 5)
    return container.order_service().place(user.id, [(pen.id, 1)]).id


def test_start_creates_running_execution(container, order_id):
    e = container.execution_service().start(order_id)
    assert (e.order_id, e.status, e.images) == (order_id, "running", [])
    assert e.created_at is not None
    assert container.execution_service().get(e.id).id == e.id


def test_start_unknown_order(container):
    with pytest.raises(OrderNotFoundError):
        container.execution_service().start(999)


def test_get_unknown_execution(container):
    with pytest.raises(ExecutionNotFoundError):
        container.execution_service().get(new_id())


def test_complete_is_idempotent(container, order_id):
    svc = container.execution_service()
    e = svc.start(order_id)
    ids = [new_id(), new_id()]
    done = svc.complete(e.id, ids)
    assert done.status == "done"
    assert [i.id for i in done.images] == ids
    again = svc.complete(e.id, ids)
    assert [i.id for i in again.images] == ids


def test_complete_with_different_images_after_done_is_rejected(container, order_id):
    svc = container.execution_service()
    e = svc.start(order_id)
    svc.complete(e.id, [new_id()])
    with pytest.raises(ExecutionNotRunningError):
        svc.complete(e.id, [new_id()])


def test_fail_then_complete_is_rejected(container, order_id):
    svc = container.execution_service()
    e = svc.start(order_id)
    failed = svc.fail(e.id, "timeout")
    assert (failed.status, failed.failure_reason) == ("failed", "timeout")
    with pytest.raises(ExecutionNotRunningError):
        svc.complete(e.id, [new_id()])


def test_fail_after_done_is_rejected(container, order_id):
    svc = container.execution_service()
    e = svc.start(order_id)
    svc.complete(e.id, [])
    with pytest.raises(ExecutionNotRunningError):
        svc.fail(e.id, "late")


def test_new_id_is_uuid7_and_ordered():
    a, b = new_id(), new_id()
    assert a.version == 7
    assert str(a) == str(a).lower() and len(str(a)) == 36
    assert a < b


def test_agent_step(container, state, order_id):
    """エージェントは image_store に保存してから complete を呼ぶ"""
    svc = container.execution_service()
    execution = svc.start(order_id)
    image_id = new_id()
    store = container.image_store()
    store.put(execution, image_id, PNG, content_type="image/png", metadata={"model": "x"})
    svc.complete(execution.id, [image_id])

    got = svc.get(execution.id)
    assert [i.id for i in got.images] == [image_id]
    assert state.image_store.objects[(execution.id, image_id)] == (PNG, "image/png", {"model": "x"})
    assert store.head(got, image_id).content_type == "image/png"
    assert store.get(got, image_id) == PNG


class TestInMemoryImageStore:
    @pytest.fixture
    def store(self):
        return InMemoryImageStore()

    @pytest.fixture
    def execution(self, container, order_id):
        return container.execution_service().start(order_id)

    def test_put_head_get_exists_delete(self, store, execution):
        iid = new_id()
        assert not store.exists(execution, iid)
        store.put(execution, iid, PNG, content_type="image/png", metadata={"k": "v"})
        info = store.head(execution, iid)
        assert (info.content_type, info.size, info.metadata) == ("image/png", len(PNG), {"k": "v"})
        assert store.get(execution, iid) == PNG
        store.delete(execution, iid)
        assert not store.exists(execution, iid)

    def test_not_found(self, store, execution):
        with pytest.raises(ArtifactNotFoundError):
            store.get(execution, new_id())
        with pytest.raises(ArtifactNotFoundError):
            store.head(execution, new_id())

    def test_content_type_is_required(self, store, execution):
        with pytest.raises(ValueError):
            store.put(execution, new_id(), PNG, content_type="binary/octet-stream")

    def test_replace_metadata(self, store, execution):
        iid = new_id()
        store.put(execution, iid, PNG, content_type="image/png", metadata={"a": "1"})
        store.replace_metadata(execution, iid, content_type="image/webp", metadata={"b": "2"})
        info = store.head(execution, iid)
        assert (info.content_type, info.metadata) == ("image/webp", {"b": "2"})
        assert store.get(execution, iid) == PNG

    def test_presigned_url(self, store, execution):
        iid = new_id()
        store.put(execution, iid, PNG, content_type="image/png")
        assert store.presigned_get_url(execution, iid).startswith("memory://")
