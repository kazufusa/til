"""ドメインのエラー。アプリ側は分類(InputError など)で HTTP ステータスなどに変換する。

全てのエラーが code(`<対象>_<原因>` の小文字)と message を持つ。
code は機械が読む識別子で、message は人が読む説明。
"""

from collections.abc import Sequence


class DomainError(Exception):
    """ドメインのルール違反。アプリ側はこれを捕まえて分類ごとに変換する"""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class InputError(DomainError):
    """入力や権限の誤り。呼び出し側が直さない限り、同じ呼び出しは何度やっても失敗する"""


class BusinessRuleError(DomainError):
    """業務ルール上の失敗。入力は正しいが、そのときの状態では実行できない"""


class DependencyError(DomainError):
    """外部依存(DB など)の一時的な失敗。時間を置いて同じ呼び出しをやり直せる"""

    retryable = True


class NotFoundError(InputError):
    pass


class UserNotFoundError(NotFoundError):
    def __init__(self, user_id: int) -> None:
        super().__init__("user_not_found", f"user {user_id} not found")
        self.user_id = user_id


class ProductNotFoundError(NotFoundError):
    def __init__(self, product_id: int) -> None:
        super().__init__("product_not_found", f"product {product_id} not found")
        self.product_id = product_id


class InvalidQuantityError(InputError):
    def __init__(self, product_id: int, quantity: int) -> None:
        super().__init__(
            "order_line_quantity_invalid",
            f"product {product_id}: quantity must be positive, got {quantity}",
        )
        self.product_id = product_id
        self.quantity = quantity


class EmptyOrderError(InputError):
    def __init__(self) -> None:
        super().__init__("order_lines_empty", "order must have at least one line")


class InvalidProductError(InputError):
    def __init__(self, message: str) -> None:
        super().__init__("product_invalid", message)


class InsufficientStockError(BusinessRuleError):
    def __init__(self, product_id: int, requested: int, available: int) -> None:
        super().__init__(
            "product_stock_insufficient",
            f"product {product_id}: requested {requested}, available {available}",
        )
        self.product_id = product_id
        self.requested = requested
        self.available = available


class ConcurrentUpdateError(BusinessRuleError):
    """同じ集約を別のトランザクションが先に更新した"""

    def __init__(self, aggregate: str, id: object) -> None:
        super().__init__(
            f"{aggregate}_concurrent_update", f"{aggregate} {id} was updated concurrently"
        )
        self.aggregate = aggregate
        self.id = id


class OrderNotFoundError(NotFoundError):
    def __init__(self, order_id: int) -> None:
        super().__init__("order_not_found", f"order {order_id} not found")
        self.order_id = order_id


class ExecutionNotFoundError(NotFoundError):
    def __init__(self, execution_id: object) -> None:
        super().__init__("execution_not_found", f"execution {execution_id} not found")
        self.execution_id = execution_id


class ExecutionNotRunningError(BusinessRuleError):
    """実行中でない Execution を完了・失敗させようとした"""

    def __init__(self, execution_id: object, status: str) -> None:
        super().__init__(
            "execution_not_running", f"execution {execution_id} is {status}, not running"
        )
        self.execution_id = execution_id
        self.status = status


class ArtifactNotFoundError(NotFoundError):
    def __init__(self, ref: str) -> None:
        super().__init__("artifact_not_found", f"artifact {ref!r} not found")
        self.ref = ref


class ArtifactStoreError(DependencyError):
    """オブジェクトストレージの障害。retryable が False なら再試行しても直らない"""

    def __init__(self, message: str, *, retryable: bool = True) -> None:
        super().__init__("artifact_store_unavailable", message)
        self.retryable = retryable


class EventPublishError(RuntimeError):
    """コミットは成功したが、ドメインイベントを EventPublisher に渡せなかった。

    DomainError ではない。書き込みはすでにコミットされているので、呼び出し側は書き込みをやり直してはならない
    (やり直すと二重に書く)。失敗したイベントの束は events にあり、元の例外は __cause__ にある。
    送り直す手段(ログに残す、アウトボックスに回すなど)を持つかどうかは、呼び出し側の判断になる。
    """

    def __init__(self, events: Sequence[object]) -> None:
        super().__init__(
            f"failed to publish {len(events)} event(s) after commit; "
            "the write is committed, do not retry it"
        )
        self.events = tuple(events)
