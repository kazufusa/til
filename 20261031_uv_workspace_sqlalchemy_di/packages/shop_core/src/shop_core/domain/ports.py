"""リポジトリの Protocol。実装は infra と testing にある"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Protocol
from uuid import UUID

from shop_core.domain.events import DomainEvent
from shop_core.domain.execution import Execution
from shop_core.domain.models import Order, Product, User


class UserRepository(Protocol):
    def store(self, user: User) -> User: ...
    def store_if_absent(self, user: User) -> User:
        """同じメールの利用者がいなければ保存して返す。いればその利用者を返す(競合しても例外にしない)"""
        ...
    def resolve_by_id(self, user_id: int) -> User | None: ...
    def resolve_by_email(self, email: str) -> User | None: ...
    def resolve_all(self) -> list[User]: ...


class ProductRepository(Protocol):
    def store(self, product: Product) -> Product: ...
    def resolve_by_id(self, product_id: int) -> Product | None: ...
    def resolve_by_id_for_update(self, product_id: int) -> Product | None: ...
    def resolve_all(self) -> list[Product]: ...


class OrderRepository(Protocol):
    def store(self, order: Order) -> Order: ...
    def resolve_by_id(self, order_id: int) -> Order | None: ...
    def resolve_by_user_id(self, user_id: int) -> list[Order]: ...


class ExecutionRepository(Protocol):
    def store(self, execution: Execution) -> Execution: ...
    def resolve_by_id(self, execution_id: UUID) -> Execution | None: ...
    def resolve_by_order_id(self, order_id: int) -> list[Execution]: ...


@dataclass(frozen=True)
class ArtifactInfo:
    content_type: str
    size: int
    metadata: dict[str, str] = field(default_factory=dict)
    etag: str = ""


class ImageStore(Protocol):
    """Execution の画像の保存先(オブジェクトストレージ)。

    呼び出し側はエンティティで指定し、S3 のキーは知らない。
    content_type は必須で、binary/octet-stream のまま保存させない。
    障害は ArtifactNotFoundError と ArtifactStoreError に変換して投げる。
    """

    def put(
        self,
        execution: Execution,
        image_id: UUID,
        data: bytes,
        *,
        content_type: str,
        metadata: Mapping[str, str] | None = None,
    ) -> None: ...
    # 起動時の到達確認。届かなければ ArtifactStoreError
    def ping(self) -> None: ...
    def get(self, execution: Execution, image_id: UUID) -> bytes: ...
    def head(self, execution: Execution, image_id: UUID) -> ArtifactInfo: ...
    def exists(self, execution: Execution, image_id: UUID) -> bool: ...
    def delete(self, execution: Execution, image_id: UUID) -> None: ...

    # S3 にメタデータだけの更新はないので、実装は自分自身へのコピーで置き換える
    def replace_metadata(
        self,
        execution: Execution,
        image_id: UUID,
        *,
        content_type: str,
        metadata: Mapping[str, str],
    ) -> None: ...

    def presigned_get_url(
        self,
        execution: Execution,
        image_id: UUID,
        *,
        expires_in: int = 900,
        response_content_type: str | None = None,
        filename: str | None = None,
    ) -> str: ...


class EventPublisher(Protocol):
    """コミット後にドメインイベントを外へ送る口。

    呼ばれるのは、最も外側のトランザクションの commit が成功したあとで、トランザクションの外。
    例外はそのまま呼び出し元に伝わる。書き込みはすでにコミットされているので、
    送れなかったイベントは失われる。アウトボックスがない限り、送る側は at-most-once で、
    at-least-once になるのはブローカーが受け取ったあとだけ。
    """

    def publish(self, events: Sequence[DomainEvent]) -> None: ...
