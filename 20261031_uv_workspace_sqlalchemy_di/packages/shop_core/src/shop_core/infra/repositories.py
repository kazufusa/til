from sqlalchemy import select
from sqlalchemy.orm import Session

from shop_core.domain.models import Order, OrderLine, Product, User
from shop_core.infra.orm import OrderLineRow, OrderRow, ProductRow, UserRow


class SqlAlchemyUserRepository:
    def __init__(self, session: Session) -> None:
        self._s = session

    def store(self, user: User) -> User:
        row = UserRow(email=user.email, name=user.name)
        self._s.add(row)
        self._s.flush()
        user.id = row.id
        return user

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
