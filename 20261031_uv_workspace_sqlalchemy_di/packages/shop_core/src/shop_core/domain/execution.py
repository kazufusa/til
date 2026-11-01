"""Execution: 注文に対して画像を生成する実行の集約。

画像の本体は ImageStore(S3)にあり、DB には画像の ID だけを持つ。
content type などのメタデータは S3 のオブジェクトメタデータが持つ。
S3 のキーの規則はアダプタの内部で、ここには持たない。
"""

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from shop_core.domain.errors import ExecutionNotRunningError

RUNNING = "running"
DONE = "done"
FAILED = "failed"


@dataclass
class Image:
    id: UUID


@dataclass
class Execution:
    id: UUID
    order_id: int
    status: str = RUNNING
    images: list[Image] = field(default_factory=list)
    created_at: datetime | None = None
    failure_reason: str | None = None
    # 楽観ロック用の版。store のたびに 1 つ上がる。読んだ版と保存時の版が違えば競合
    version: int = 0

    def complete(self, images: list[Image]) -> None:
        """同じ画像 ID での再実行は何もしない(冪等)"""
        if self.status == DONE and [i.id for i in self.images] == [i.id for i in images]:
            return
        if self.status != RUNNING:
            raise ExecutionNotRunningError(self.id, self.status)
        self.images = list(images)
        self.status = DONE
        self.failure_reason = None

    def fail(self, reason: str) -> None:
        if self.status == FAILED and self.failure_reason == reason:
            return
        if self.status != RUNNING:
            raise ExecutionNotRunningError(self.id, self.status)
        self.status = FAILED
        self.failure_reason = reason
