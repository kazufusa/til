"""S3 互換サーバで S3ImageStore を検証する。TEST_S3_ENDPOINT_URL がなければ skip

    docker run -d --name s3mock -p 59000:9090 adobe/s3mock:4.7.0
    TEST_S3_ENDPOINT_URL=http://localhost:59000 TEST_S3_IMPL=s3mock \\
      AWS_ACCESS_KEY_ID=x AWS_SECRET_ACCESS_KEY=x uv run pytest -q packages/shop_core/tests/test_image_store_s3.py

TEST_S3_IMPL=s3mock のときは、s3mock が CopyObject で Content-Type を置き換えない制約を xfail にする。
MinIO や本物の S3 では TEST_S3_IMPL を付けない。
"""

import os
import urllib.request
import uuid

import boto3
import pytest

from shop_core import ArtifactNotFoundError, ArtifactStoreError, Execution, S3ImageStore, new_id

ENDPOINT = os.environ.get("TEST_S3_ENDPOINT_URL")
S3_IMPL = os.environ.get("TEST_S3_IMPL", "")
pytestmark = pytest.mark.skipif(ENDPOINT is None, reason="TEST_S3_ENDPOINT_URL not set")

PNG = b"\x89PNG\r\n\x1a\nfake"


@pytest.fixture(scope="session")
def bucket():
    return f"shop-test-{uuid.uuid4().hex[:12]}"


@pytest.fixture
def store(bucket):
    s = S3ImageStore(bucket, endpoint_url=ENDPOINT, region="ap-northeast-1")
    s.ensure_bucket()
    s.ensure_bucket()  # 2 回目は何もしない
    return s


@pytest.fixture
def execution():
    return Execution(id=new_id(), order_id=7)


def test_put_head_get(store, execution):
    iid = new_id()
    store.put(execution, iid, PNG, content_type="image/png", metadata={"model": "x"})
    info = store.head(execution, iid)
    assert info.content_type == "image/png"
    assert info.metadata == {"model": "x"}
    assert info.size == len(PNG)
    assert store.get(execution, iid) == PNG


def test_actual_key_layout(store, execution, bucket):
    """アダプタの契約: キーは orders/<order_id>/executions/<execution_id>/<image_id>"""
    iid = new_id()
    store.put(execution, iid, PNG, content_type="image/png")
    raw = boto3.client("s3", endpoint_url=ENDPOINT, region_name="ap-northeast-1")
    keys = [o["Key"] for o in raw.list_objects_v2(Bucket=bucket)["Contents"]]
    assert f"orders/7/executions/{execution.id}/{iid}" in keys


def test_content_type_is_required(store, execution):
    with pytest.raises(ValueError):
        store.put(execution, new_id(), PNG, content_type="binary/octet-stream")


def test_exists_and_delete(store, execution):
    iid = new_id()
    assert not store.exists(execution, iid)
    store.put(execution, iid, PNG, content_type="image/png")
    assert store.exists(execution, iid)
    store.delete(execution, iid)
    assert not store.exists(execution, iid)
    store.delete(execution, iid)  # 存在しなくても成功する


def test_not_found(store, execution):
    with pytest.raises(ArtifactNotFoundError):
        store.get(execution, new_id())
    with pytest.raises(ArtifactNotFoundError):
        store.head(execution, new_id())


def test_replace_metadata(store, execution):
    iid = new_id()
    store.put(execution, iid, PNG, content_type="image/png", metadata={"a": "1"})
    store.replace_metadata(execution, iid, content_type="image/webp", metadata={"b": "2"})
    info = store.head(execution, iid)
    assert info.metadata == {"b": "2"}
    assert store.get(execution, iid) == PNG
    if S3_IMPL == "s3mock" and info.content_type != "image/webp":
        pytest.xfail("s3mock は CopyObject(MetadataDirective=REPLACE) で Content-Type を置き換えない")
    assert info.content_type == "image/webp"


def test_replace_metadata_not_found(store, execution):
    with pytest.raises(ArtifactNotFoundError):
        store.replace_metadata(execution, new_id(), content_type="image/png", metadata={})


def test_presigned_get_url_works(store, execution):
    iid = new_id()
    store.put(execution, iid, PNG, content_type="image/png")
    url = store.presigned_get_url(execution, iid, filename="a b.png")
    with urllib.request.urlopen(url) as r:
        assert r.read() == PNG
        assert r.headers["Content-Type"] == "image/png"
        assert "a%20b.png" in r.headers["Content-Disposition"]
    url = store.presigned_get_url(execution, iid, response_content_type="image/jpeg")
    with urllib.request.urlopen(url) as r:
        assert r.headers["Content-Type"] == "image/jpeg"


def test_presigned_url_uses_public_endpoint(execution):
    # 署名はローカル計算なので、公開側の endpoint に接続できなくても URL は作れる
    public = "http://files.example.test:9000"
    s = S3ImageStore(
        "b", endpoint_url=ENDPOINT, region="ap-northeast-1", public_endpoint_url=public
    )
    url = s.presigned_get_url(execution, new_id())
    assert url.startswith(f"{public}/b/orders/7/executions/")
    assert "X-Amz-Signature=" in url


def test_presigned_url_works_when_public_equals_internal(bucket, execution):
    s = S3ImageStore(
        bucket, endpoint_url=ENDPOINT, region="ap-northeast-1", public_endpoint_url=ENDPOINT
    )
    s.ensure_bucket()
    iid = new_id()
    s.put(execution, iid, PNG, content_type="image/png")
    url = s.presigned_get_url(execution, iid)
    assert url.startswith(ENDPOINT)
    with urllib.request.urlopen(url) as r:
        assert r.read() == PNG


def test_wrong_endpoint_raises_store_error(execution):
    s = S3ImageStore("nobucket", endpoint_url="http://127.0.0.1:1", region="ap-northeast-1")
    with pytest.raises(ArtifactStoreError) as e:
        s.get(execution, new_id())
    assert e.value.retryable is True
