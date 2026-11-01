"""ユースケースサービス。アプリチームが呼ぶ入口はここだけ。

1 メソッド = 1 トランザクション。中で UoW を開いて閉じるので、
呼ぶ側は commit も rollback も書かない。

状態が変わったときは、commit の直前に uow.events.add(...) でドメインイベントを足す。
イベントは最も外側のトランザクションの commit が成功したあとに EventPublisher へ渡る。
"""

from collections.abc import Callable
from uuid import UUID

from shop_core.domain.errors import (
    ConcurrentUpdateError,
    ExecutionNotFoundError,
    OrderNotFoundError,
    EmptyOrderError,
    InvalidProductError,
    ProductNotFoundError,
    UserNotFoundError,
)
from shop_core.domain.events import (
    ExecutionCompleted,
    ExecutionFailed,
    ExecutionStarted,
    OrderPlaced,
    UserRegistered,
)
from shop_core.domain.execution import Execution, Image
from shop_core.domain.models import Order, OrderLine, Product, User
from shop_core.ids import new_id
from shop_core.usecase.uow import UnitOfWork

UowFactory = Callable[[], UnitOfWork]


class UserService:
    def __init__(self, uow: UowFactory) -> None:
        self._uow = uow

    def register(self, email: str, name: str) -> User:
        with self._uow() as uow:
            # 同じメールの同時登録でも、1 行だけ作られ、全員が同じ利用者を受け取る
            candidate = User(id=None, email=email, name=name)
            user = uow.users.store_if_absent(candidate)
            # 新しく作ったときだけ(既存の利用者が返ったときは足さない)
            if user is candidate:
                uow.events.add(UserRegistered(user_id=user.id, email=user.email))
            uow.commit()
            return user

    def get(self, user_id: int) -> User:
        with self._uow() as uow:
            user = uow.users.resolve_by_id(user_id)
            if user is None:
                raise UserNotFoundError(user_id)
            return user

    def list(self) -> list[User]:
        with self._uow() as uow:
            return uow.users.resolve_all()


class ProductService:
    def __init__(self, uow: UowFactory) -> None:
        self._uow = uow

    def add(self, name: str, price: int, stock: int) -> Product:
        if price < 0:
            raise InvalidProductError(f"price must not be negative, got {price}")
        if stock < 0:
            raise InvalidProductError(f"stock must not be negative, got {stock}")
        with self._uow() as uow:
            product = uow.products.store(Product(id=None, name=name, price=price, stock=stock))
            uow.commit()
            return product

    def list(self) -> list[Product]:
        with self._uow() as uow:
            return uow.products.resolve_all()


class OrderService:
    def __init__(self, uow: UowFactory) -> None:
        self._uow = uow

    def place(self, user_id: int, items: list[tuple[int, int]]) -> Order:
        """items は (product_id, quantity) の列。在庫引き当てと注文作成を 1 トランザクションで行う"""
        with self._uow() as uow:
            if uow.users.resolve_by_id(user_id) is None:
                raise UserNotFoundError(user_id)
            if not items:
                raise EmptyOrderError()
            # 同時注文でデッドロックしないよう、行ロックは商品 id の昇順で取る。
            # order.lines は呼び出し側の順序のまま残す
            reserved: dict[int, Product] = {}
            for product_id in sorted({pid for pid, _ in items}):
                product = uow.products.resolve_by_id_for_update(product_id)
                if product is None:
                    raise ProductNotFoundError(product_id)
                reserved[product_id] = product
            lines: list[OrderLine] = []
            for product_id, quantity in items:
                product = reserved[product_id]
                product.reserve(quantity)
                lines.append(
                    OrderLine(product_id=product_id, quantity=quantity, unit_price=product.price)
                )
            for product in reserved.values():
                uow.products.store(product)
            order = uow.orders.store(Order(id=None, user_id=user_id, lines=lines))
            uow.events.add(OrderPlaced(order_id=order.id, user_id=user_id, total=order.total))
            uow.commit()
            return order

    def list_by_user(self, user_id: int) -> list[Order]:
        with self._uow() as uow:
            return uow.orders.resolve_by_user_id(user_id)


class ExecutionService:
    """Execution の状態管理。S3 には触らない。

    エージェントは container.image_store().put(execution, image_id, ...) で
    画像を保存してから complete を呼ぶ。

    楽観ロック: Execution は版(version)を持ち、保存のたびに 1 つ上がる。
    読んだ版のまま保存できなければ ConcurrentUpdateError になる(別のトランザクションが先に更新した)。
    complete と fail は expected_version を受け取れる。呼び出し側が先に get で読んだ版を渡すと、
    その間に更新されていた場合に、何も変えずに ConcurrentUpdateError を返す。

    ライブラリは ConcurrentUpdateError を再試行しない。読み直して判断し直すのは呼び出し側の仕事で、
    状態が変わっていることがあるため、同じ入力をそのままやり直してよいとは限らない。
    """

    def __init__(self, uow: UowFactory) -> None:
        self._uow = uow

    def start(self, order_id: int) -> Execution:
        with self._uow() as uow:
            if uow.orders.resolve_by_id(order_id) is None:
                raise OrderNotFoundError(order_id)
            execution = uow.executions.store(Execution(id=new_id(), order_id=order_id))
            uow.events.add(ExecutionStarted(execution_id=execution.id, order_id=order_id))
            uow.commit()
            return execution

    def complete(
        self, execution_id: UUID, image_ids: list[UUID], *, expected_version: int | None = None
    ) -> Execution:
        """完了させる。expected_version を渡すと、版が違えば何も変えずに ConcurrentUpdateError。

        すでに同じ image_ids で完了していれば、何も変えない(冪等)。
        保存もイベントもなく、版も上がらず、現在の状態をそのまま返す。
        """
        with self._uow() as uow:
            execution = self._load(uow, execution_id)
            self._check_version(execution, expected_version)
            before = (execution.status, [i.id for i in execution.images])
            execution.complete([Image(id=i) for i in image_ids])
            if before == (execution.status, [i.id for i in execution.images]):
                return execution
            uow.executions.store(execution)
            uow.events.add(
                ExecutionCompleted(
                    execution_id=execution.id,
                    order_id=execution.order_id,
                    image_ids=tuple(i.id for i in execution.images),
                )
            )
            uow.commit()
            return execution

    def fail(
        self, execution_id: UUID, reason: str, *, expected_version: int | None = None
    ) -> Execution:
        """失敗させる。expected_version を渡すと、版が違えば何も変えずに ConcurrentUpdateError。

        すでに同じ reason で失敗していれば、何も変えない(冪等)。
        保存もイベントもなく、版も上がらず、現在の状態をそのまま返す。
        """
        with self._uow() as uow:
            execution = self._load(uow, execution_id)
            self._check_version(execution, expected_version)
            before = execution.status
            execution.fail(reason)
            if before == execution.status:
                return execution
            uow.executions.store(execution)
            uow.events.add(
                ExecutionFailed(
                    execution_id=execution.id, order_id=execution.order_id, reason=reason
                )
            )
            uow.commit()
            return execution

    def get(self, execution_id: UUID) -> Execution:
        with self._uow() as uow:
            return self._load(uow, execution_id)

    @staticmethod
    def _check_version(execution: Execution, expected_version: int | None) -> None:
        if expected_version is not None and expected_version != execution.version:
            raise ConcurrentUpdateError("execution", execution.id)

    @staticmethod
    def _load(uow: UnitOfWork, execution_id: UUID) -> Execution:
        execution = uow.executions.resolve_by_id(execution_id)
        if execution is None:
            raise ExecutionNotFoundError(execution_id)
        return execution
