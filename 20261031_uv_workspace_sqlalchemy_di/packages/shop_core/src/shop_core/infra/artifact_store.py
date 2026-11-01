"""ImageStore の S3 実装。botocore の例外はここで domain の例外に変換する。

S3 のキーの規則はこのモジュールの中だけにある(リポジトリの行変換と同じ扱い)。
レイアウトを変えるときはアダプタが面倒を見るので、呼び出し側はキーを知らなくてよい。
"""

from collections.abc import Callable, Mapping
from typing import Any, TypeVar
from urllib.parse import quote
from uuid import UUID

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from shop_core.domain.errors import ArtifactNotFoundError, ArtifactStoreError
from shop_core.domain.execution import Execution
from shop_core.domain.ports import ArtifactInfo

T = TypeVar("T")

_NOT_FOUND = {"404", "NoSuchKey", "NotFound"}


def _key(execution: Execution, image_id: UUID) -> str:
    """orders/{order_id}/executions/{execution_id}/{image_id}。拡張子は付けず、種類は content type で表す"""
    return f"orders/{execution.order_id}/executions/{execution.id}/{image_id}"


class S3ImageStore:
    def __init__(
        self,
        bucket: str,
        *,
        endpoint_url: str | None = None,
        region: str | None = None,
        public_endpoint_url: str | None = None,
    ) -> None:
        self.bucket = bucket
        # MinIO は仮想ホスト形式を解決できないので、endpoint 指定時は path style にする。
        # 接続失敗で長く待たないよう、timeout と再試行回数は短めにする
        config = Config(
            s3={"addressing_style": "path"} if endpoint_url else {},
            connect_timeout=3,
            read_timeout=10,
            retries={"max_attempts": 2},
            signature_version="s3v4",
        )
        self._client: Any = boto3.client(
            "s3", endpoint_url=endpoint_url, region_name=region, config=config
        )
        # 署名付き URL はホスト名も署名の対象なので、利用者から見える名前で署名する。
        # 内部の名前(コンテナ間)と違うときだけ、署名専用の 2 つ目のクライアントを作る。
        # 署名はローカル計算なので、この endpoint にこちらから接続することはない
        self._public_client: Any = (
            boto3.client(
                "s3", endpoint_url=public_endpoint_url, region_name=region, config=config
            )
            if public_endpoint_url and public_endpoint_url != endpoint_url
            else self._client
        )

    def ensure_bucket(self) -> None:
        """バケットがなければ作る。ローカルとテスト専用(本番のバケットは IaC が作る)"""

        def run() -> None:
            try:
                self._client.head_bucket(Bucket=self.bucket)
            except ClientError as e:
                if _code(e) not in _NOT_FOUND:
                    raise
                self._client.create_bucket(Bucket=self.bucket)

        self._call(None, run)

    def ping(self) -> None:
        """バケットに到達できるか確かめる(head_bucket)。起動時の検査用で、作りはしない"""
        self._call(None, lambda: self._client.head_bucket(Bucket=self.bucket))

    def put(
        self,
        execution: Execution,
        image_id: UUID,
        data: bytes,
        *,
        content_type: str,
        metadata: Mapping[str, str] | None = None,
    ) -> None:
        if not content_type or content_type == "binary/octet-stream":
            raise ValueError("content_type is required and must not be binary/octet-stream")
        key = _key(execution, image_id)
        self._call(
            key,
            lambda: self._client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
                Metadata=dict(metadata or {}),
            ),
        )

    def get(self, execution: Execution, image_id: UUID) -> bytes:
        key = _key(execution, image_id)
        return self._call(
            key, lambda: self._client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        )

    def head(self, execution: Execution, image_id: UUID) -> ArtifactInfo:
        key = _key(execution, image_id)
        r = self._call(key, lambda: self._client.head_object(Bucket=self.bucket, Key=key))
        return ArtifactInfo(
            content_type=r["ContentType"],
            size=r["ContentLength"],
            metadata=dict(r.get("Metadata", {})),
            etag=r["ETag"].strip('"'),
        )

    def exists(self, execution: Execution, image_id: UUID) -> bool:
        try:
            self.head(execution, image_id)
        except ArtifactNotFoundError:
            return False
        return True

    def delete(self, execution: Execution, image_id: UUID) -> None:
        # S3 の delete は存在しないキーでも成功する
        key = _key(execution, image_id)
        self._call(key, lambda: self._client.delete_object(Bucket=self.bucket, Key=key))

    def replace_metadata(
        self,
        execution: Execution,
        image_id: UUID,
        *,
        content_type: str,
        metadata: Mapping[str, str],
    ) -> None:
        key = _key(execution, image_id)
        self._call(
            key,
            lambda: self._client.copy_object(
                Bucket=self.bucket,
                Key=key,
                CopySource={"Bucket": self.bucket, "Key": key},
                MetadataDirective="REPLACE",
                ContentType=content_type,
                Metadata=dict(metadata),
            ),
        )

    def presigned_get_url(
        self,
        execution: Execution,
        image_id: UUID,
        *,
        expires_in: int = 900,
        response_content_type: str | None = None,
        filename: str | None = None,
    ) -> str:
        params: dict[str, str] = {"Bucket": self.bucket, "Key": _key(execution, image_id)}
        if response_content_type:
            params["ResponseContentType"] = response_content_type
        if filename:
            params["ResponseContentDisposition"] = (
                f"attachment; filename*=UTF-8''{quote(filename)}"
            )
        # 署名はローカル計算で、S3 には接続しない
        return self._public_client.generate_presigned_url(
            "get_object", Params=params, ExpiresIn=expires_in
        )

    def _call(self, key: str | None, fn: Callable[[], T]) -> T:
        try:
            return fn()
        except ClientError as e:
            code = _code(e)
            status = e.response.get("ResponseMetadata", {}).get("HTTPStatusCode", 0)
            if key is not None and (code in _NOT_FOUND or status == 404):
                raise ArtifactNotFoundError(key) from e
            raise ArtifactStoreError(
                f"s3 error {code}: {e}", retryable=status >= 500 or code == "SlowDown"
            ) from e
        except BotoCoreError as e:
            # EndpointConnectionError、ConnectTimeout、ReadTimeout など
            raise ArtifactStoreError(f"s3 unreachable: {e}", retryable=True) from e


def _code(e: ClientError) -> str:
    return str(e.response.get("Error", {}).get("Code", ""))
