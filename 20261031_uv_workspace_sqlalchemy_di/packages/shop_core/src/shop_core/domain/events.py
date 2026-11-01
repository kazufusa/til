"""ドメインイベント。コミットが成功したあとに EventPublisher へ渡される事実の記録。

event_id は送る側が採番する。受け手は同じ event_id を 2 度受け取ったら捨てればよい。
occurred_at は UTC のタイムゾーン付きで、イベントを作った時刻になる。
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from shop_core.domain.errors import EventPublishError
from shop_core.ids import new_id


def _now() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True, kw_only=True)
class DomainEvent:
    event_id: UUID = field(default_factory=new_id)
    occurred_at: datetime = field(default_factory=_now)


@dataclass(frozen=True, kw_only=True)
class UserRegistered(DomainEvent):
    user_id: int
    email: str


@dataclass(frozen=True, kw_only=True)
class OrderPlaced(DomainEvent):
    order_id: int
    user_id: int
    total: int


@dataclass(frozen=True, kw_only=True)
class ExecutionStarted(DomainEvent):
    execution_id: UUID
    order_id: int


@dataclass(frozen=True, kw_only=True)
class ExecutionCompleted(DomainEvent):
    execution_id: UUID
    order_id: int
    image_ids: tuple[UUID, ...]


@dataclass(frozen=True, kw_only=True)
class ExecutionFailed(DomainEvent):
    execution_id: UUID
    order_id: int
    reason: str


class EventBuffer:
    """UoW が集めるイベントの入れ物。サービスは uow.events.add(event) で足す"""

    def __init__(self) -> None:
        self._items: list[DomainEvent] = []

    def add(self, event: DomainEvent) -> None:
        self._items.append(event)

    def drain(self) -> list[DomainEvent]:
        """溜まっているイベントを順に返し、空にする"""
        items, self._items = self._items, []
        return items

    def clear(self) -> None:
        self._items = []


def publish_events(publisher: Any, events: Sequence[DomainEvent]) -> None:
    """コミット後にイベントを publisher へ渡す。どんな例外も EventPublishError に包む。

    書き込みはコミット済みなので、呼び出し側は書き込みをやり直さない。元の例外は __cause__ に残る。
    """
    try:
        publisher.publish(events)
    except Exception as exc:
        raise EventPublishError(events) from exc
