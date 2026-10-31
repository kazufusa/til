class DomainError(Exception):
    """ドメインのルール違反。アプリ側はこれを捕まえて HTTP ステータスに変換する"""


class NotFoundError(DomainError):
    pass


class UserNotFoundError(NotFoundError):
    def __init__(self, user_id: int) -> None:
        super().__init__(f"user {user_id} not found")
        self.user_id = user_id


class ProductNotFoundError(NotFoundError):
    def __init__(self, product_id: int) -> None:
        super().__init__(f"product {product_id} not found")
        self.product_id = product_id


class InsufficientStockError(DomainError):
    def __init__(self, product_id: int, requested: int, available: int) -> None:
        super().__init__(
            f"product {product_id}: requested {requested}, available {available}"
        )
        self.product_id = product_id
        self.requested = requested
        self.available = available
