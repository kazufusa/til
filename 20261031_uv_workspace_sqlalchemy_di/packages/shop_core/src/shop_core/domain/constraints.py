"""DB が守る不変条件の宣言。本物の翻訳とフェイクが同じ表を読む。

infra/constraints.py は name から error を引く表をここから作り、
testing.py のフェイクは key / where / predicate を評価して同じ error を投げる。
制約を足すときは、マイグレーションとここに 1 件ずつ書けばよい。

name は Postgres の制約名またはインデックス名で、マイグレーションと一致させる。
一致はテストが実際のカタログと突き合わせて確かめる。
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from shop_core.domain.errors import BusinessRuleError, DomainError, InputError
from shop_core.domain.execution import RUNNING


@dataclass(frozen=True)
class Constraint:
    name: str
    # users / products / order_lines / executions / execution_images
    collection: str
    kind: Literal["unique", "check"]
    error: Callable[[], DomainError]
    # unique: 行の組を返す。同じ組の行が 2 つあってはならない
    key: Callable[[Any], tuple] | None = None
    # unique: 部分一意。これが真の行だけが対象になる
    where: Callable[[Any], bool] | None = None
    # check: 行が満たすべき条件
    predicate: Callable[[Any], bool] | None = None

    def __post_init__(self) -> None:
        if self.kind == "unique" and self.key is None:
            raise ValueError(f"{self.name}: unique constraint needs key")
        if self.kind == "check" and self.predicate is None:
            raise ValueError(f"{self.name}: check constraint needs predicate")


CONSTRAINTS: tuple[Constraint, ...] = (
    Constraint(
        name="users_email_key",
        collection="users",
        kind="unique",
        key=lambda u: (u.email,),
        error=lambda: BusinessRuleError("user_email_taken", "email is already registered"),
    ),
    Constraint(
        name="ck_products_stock_nonnegative",
        collection="products",
        kind="check",
        predicate=lambda p: p.stock >= 0,
        error=lambda: BusinessRuleError(
            "product_stock_negative", "product stock must not be negative"
        ),
    ),
    Constraint(
        name="ck_order_lines_quantity_positive",
        collection="order_lines",
        kind="check",
        predicate=lambda line: line.quantity > 0,
        error=lambda: InputError(
            "order_line_quantity_invalid", "order line quantity must be positive"
        ),
    ),
    # 注文ごとに実行中の Execution は 1 つだけ。終わった(done / failed)ものは数えない
    Constraint(
        name="uq_executions_one_running_per_order",
        collection="executions",
        kind="unique",
        key=lambda e: (e.order_id,),
        where=lambda e: e.status == RUNNING,
        error=lambda: BusinessRuleError(
            "execution_already_running", "order already has a running execution"
        ),
    ),
    Constraint(
        name="uq_execution_images_ordinal",
        collection="execution_images",
        kind="unique",
        key=lambda r: (r.execution_id, r.ordinal),
        error=lambda: BusinessRuleError(
            "execution_image_ordinal_taken", "execution image ordinal is already used"
        ),
    ),
)
