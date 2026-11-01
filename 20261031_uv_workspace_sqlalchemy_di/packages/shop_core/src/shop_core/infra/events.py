"""EventPublisher の既定のアダプタ。ログに出すだけで、どこにも送らない"""

import logging
from collections.abc import Sequence
from dataclasses import fields

from shop_core.domain.events import DomainEvent

logger = logging.getLogger("shop_core.events")


class LoggingEventPublisher:
    """各イベントを INFO で 1 行ずつ出す。クラス名、event_id、残りのフィールドの順"""

    def publish(self, events: Sequence[DomainEvent]) -> None:
        for event in events:
            payload = {
                f.name: getattr(event, f.name)
                for f in fields(event)
                if f.name not in ("event_id",)
            }
            logger.info("%s event_id=%s %s", type(event).__name__, event.event_id, payload)
