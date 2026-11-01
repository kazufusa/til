from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from shop_core.domain.errors import ConcurrentUpdateError
from shop_core.domain.execution import Execution, Image
from shop_core.domain.models import Order, OrderLine, Product, User
from shop_core.infra.orm import ExecutionImageRow, ExecutionRow, OrderLineRow, OrderRow, ProductRow, UserRow


class SqlAlchemyUserRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def store(self, user: User) -> User:
        row = UserRow(email=user.email, name=user.name)
        self._s.add(row)
        self._s.flush()
        user.id = row.id
        return user

    def store_if_absent(self, user: User) -> User:
        # ON CONFLICT DO NOTHING なので、同時登録でも例外を出さず、後から来た側は既存の行を読む
        stmt = (
            pg_insert(UserRow)
            .values(email=user.email, name=user.name)
            .on_conflict_do_nothing(index_elements=[UserRow.email])
            .returning(UserRow.id)
        )
        new_id = self._s.scalar(stmt)
        if new_id is not None:
            user.id = new_id
            return user
        existing = self.resolve_by_email(user.email)
        if existing is None:
            raise RuntimeError(f"user {user.email} vanished after conflict")
        return existing

    def resolve_by_id(self, user_id: int) -> User | None:
        row = self._s.get(UserRow, user_id)
        return _to_user(row) if row else None

    def resolve_by_email(self, email: str) -> User | None:
        row = self._s.scalar(select(UserRow).where(UserRow.email == email))
        return _to_user(row) if row else None

    def resolve_all(self) -> list[User]:
        return [_to_user(r) for r in self._s.scalars(select(UserRow).order_by(UserRow.id))]


class SqlAlchemyProductRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def store(self, product: Product) -> Product:
        if product.id is None:
            row = ProductRow(name=product.name, price=product.price, stock=product.stock)
            self._s.add(row)
            self._s.flush()
            product.id = row.id
            return product
        row = self._s.get(ProductRow, product.id)
        if row is None:
            raise ValueError(f"product {product.id} is not persisted")
        row.name = product.name
        row.price = product.price
        row.stock = product.stock
        self._s.flush()
        return product

    def resolve_by_id(self, product_id: int) -> Product | None:
        row = self._s.get(ProductRow, product_id)
        return _to_product(row) if row else None

    def resolve_by_id_for_update(self, product_id: int) -> Product | None:
        row = self._s.get(ProductRow, product_id, with_for_update=True)
        return _to_product(row) if row else None

    def resolve_all(self) -> list[Product]:
        return [
            _to_product(r) for r in self._s.scalars(select(ProductRow).order_by(ProductRow.id))
        ]


class SqlAlchemyOrderRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def store(self, order: Order) -> Order:
        row = OrderRow(
            user_id=order.user_id,
            lines=[
                OrderLineRow(
                    product_id=line.product_id,
                    quantity=line.quantity,
                    unit_price=line.unit_price,
                )
                for line in order.lines
            ],
        )
        self._s.add(row)
        self._s.flush()
        order.id = row.id
        order.created_at = row.created_at
        return order

    def resolve_by_id(self, order_id: int) -> Order | None:
        row = self._s.get(OrderRow, order_id)
        return _to_order(row) if row else None

    def resolve_by_user_id(self, user_id: int) -> list[Order]:
        stmt = select(OrderRow).where(OrderRow.user_id == user_id).order_by(OrderRow.id)
        return [_to_order(r) for r in self._s.scalars(stmt)]


def _to_user(row: UserRow) -> User:
    return User(id=row.id, email=row.email, name=row.name)


def _to_product(row: ProductRow) -> Product:
    return Product(id=row.id, name=row.name, price=row.price, stock=row.stock)


def _to_order(row: OrderRow) -> Order:
    return Order(
        id=row.id,
        user_id=row.user_id,
        created_at=row.created_at,
        lines=[
            OrderLine(product_id=l.product_id, quantity=l.quantity, unit_price=l.unit_price)
            for l in row.lines
        ],
    )


class SqlAlchemyExecutionRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def store(self, execution: Execution) -> Execution:
        """楽観ロックで保存する。

        既存の行は、読んだ版(execution.version)が今の版と違えば ConcurrentUpdateError。
        変更がなくても版を 1 つ上げるので、古い写しでの保存は必ず競合になる。
        新規は版 0 で入れる。
        """
        row = self._s.get(ExecutionRow, execution.id)
        if row is None:
            row = ExecutionRow(id=execution.id, order_id=execution.order_id, version=0)
            self._s.add(row)
        elif row.version != execution.version:
            # 読んだあとに別のトランザクションがコミットしていた
            raise ConcurrentUpdateError("execution", execution.id)
        else:
            # UPDATE の WHERE は Session が読んだ版で検査する。get から flush までの間の
            # 競合(行ロック待ちのあとに版が変わっていた場合)は StaleDataError になる
            row.version = execution.version + 1
        row.status = execution.status
        row.failure_reason = execution.failure_reason
        try:
            # 画像は ordinal 付きで全置換する。同じ並びなら行は変わらない
            if [i.id for i in row.images] != [i.id for i in execution.images]:
                row.images.clear()
                self._s.flush()
                row.images.extend(
                    ExecutionImageRow(id=i.id, ordinal=n) for n, i in enumerate(execution.images)
                )
            self._s.flush()
        except StaleDataError:
            raise ConcurrentUpdateError("execution", execution.id) from None
        self._s.refresh(row, attribute_names=["created_at"])
        execution.created_at = row.created_at
        execution.version = row.version
        return execution

    def resolve_by_id(self, execution_id: UUID) -> Execution | None:
        row = self._s.get(ExecutionRow, execution_id)
        return _to_execution(row) if row else None

    def resolve_by_order_id(self, order_id: int) -> list[Execution]:
        stmt = (
            select(ExecutionRow).where(ExecutionRow.order_id == order_id).order_by(ExecutionRow.id)
        )
        return [_to_execution(r) for r in self._s.scalars(stmt)]


def _to_execution(row: ExecutionRow) -> Execution:
    return Execution(
        id=row.id,
        order_id=row.order_id,
        status=row.status,
        images=[Image(id=i.id) for i in row.images],
        created_at=row.created_at,
        failure_reason=row.failure_reason,
        version=row.version,
    )
