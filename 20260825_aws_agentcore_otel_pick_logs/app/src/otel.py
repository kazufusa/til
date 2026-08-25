"""OTELスパンのjsonl変換と、メモリ蓄積型エクスポータ。

jsonl化はすべてensure_ascii=Falseで行い、日本語をUTF-8文字列のまま出力する。
"""

import json
import threading
from typing import Any, Sequence

from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult


def _attr_value(value: Any) -> Any:
    if isinstance(value, (list, tuple)):
        return list(value)
    return value


def span_to_dict(span: ReadableSpan) -> dict:
    """ReadableSpanをJSON化可能なdictへ変換する。属性は無加工で保持する。"""
    ctx = span.get_span_context()
    parent = span.parent
    return {
        "name": span.name,
        "trace_id": f"{ctx.trace_id:032x}",
        "span_id": f"{ctx.span_id:016x}",
        "parent_span_id": f"{parent.span_id:016x}" if parent else None,
        "kind": span.kind.name,
        "start_time_unix_nano": span.start_time,
        "end_time_unix_nano": span.end_time,
        "status": {
            "code": span.status.status_code.name,
            "description": span.status.description,
        },
        "attributes": {k: _attr_value(v) for k, v in (span.attributes or {}).items()},
        "events": [
            {
                "name": event.name,
                "time_unix_nano": event.timestamp,
                "attributes": {k: _attr_value(v) for k, v in (event.attributes or {}).items()},
            }
            for event in span.events
        ],
        "resource": {k: _attr_value(v) for k, v in span.resource.attributes.items()},
    }


def span_to_jsonl_line(span: ReadableSpan) -> str:
    """ConsoleSpanExporterのformatterとして使う1行JSON変換。"""
    return json.dumps(span_to_dict(span), ensure_ascii=False) + "\n"


class InMemoryJsonlExporter(SpanExporter):
    """終了した全スパンをメモリへ蓄積し、jsonl文字列としてまとめて取り出すエクスポータ。

    Graphが1回のinvocation内で完走することを前提とする(SPEC.md参照)。
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._spans: list[dict] = []

    def export(self, spans: Sequence[ReadableSpan]) -> SpanExportResult:
        with self._lock:
            self._spans.extend(span_to_dict(s) for s in spans)
        return SpanExportResult.SUCCESS

    def clear(self) -> None:
        with self._lock:
            self._spans = []

    def span_count(self) -> int:
        with self._lock:
            return len(self._spans)

    def to_jsonl(self) -> str:
        with self._lock:
            return "".join(json.dumps(d, ensure_ascii=False) + "\n" for d in self._spans)

    def shutdown(self) -> None:
        pass

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True
