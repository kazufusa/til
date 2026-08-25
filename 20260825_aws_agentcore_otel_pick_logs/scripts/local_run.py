#!/usr/bin/env python3
"""ローカル実験: Graphを直接実行し、全スパンをjsonlファイルへ書く。

使い方:
    uv run --project app scripts/local_run.py --gate pass --payload-lines 3
"""

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app" / "src"))
sys.path.insert(0, str(ROOT / "scripts"))

from opentelemetry.sdk.trace.export import ConsoleSpanExporter, SimpleSpanProcessor
from strands.telemetry import StrandsTelemetry

from graph import run_graph
from otel import InMemoryJsonlExporter, span_to_jsonl_line
from payload_util import add_common_args, build_invoke_payload


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_args(parser)
    args = parser.parse_args()
    payload = build_invoke_payload(args)

    traces_dir = ROOT / "out" / "traces"
    ng_dir = ROOT / "out" / "ng-dumps"
    traces_dir.mkdir(parents=True, exist_ok=True)
    ng_dir.mkdir(parents=True, exist_ok=True)

    started = int(time.time())
    trace_path = traces_dir / f"{started}.jsonl"

    memory_exporter = InMemoryJsonlExporter()
    with open(trace_path, "w", encoding="utf-8") as trace_file:
        telemetry = StrandsTelemetry()
        telemetry.tracer_provider.add_span_processor(
            SimpleSpanProcessor(
                ConsoleSpanExporter(out=trace_file, formatter=span_to_jsonl_line)
            )
        )
        telemetry.tracer_provider.add_span_processor(
            SimpleSpanProcessor(memory_exporter)
        )

        outcome = run_graph(
            payload["topic"], payload["prompt_payload"], payload["gate_min_length"]
        )
        telemetry.tracer_provider.force_flush()
        trace_file.flush()

    ng_dump_path = None
    if not outcome.gate_passed:
        ng_dump_path = ng_dir / f"local_{started}.jsonl"
        ng_dump_path.write_text(memory_exporter.to_jsonl(), encoding="utf-8")

    summary = {
        "gate": outcome.gate_verdict,
        "final_text": outcome.final_text,
        "completed_nodes": outcome.completed_nodes,
        "span_count": memory_exporter.span_count(),
        "prompt_payload_chars": len(payload["prompt_payload"]),
        "trace_file": str(trace_path),
        "ng_dump": str(ng_dump_path) if ng_dump_path else None,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
