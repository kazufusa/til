"""otel トレースの jsonl 出力.

StrandsTelemetry().setup_console_exporter(**kwargs) は kwargs をそのまま
opentelemetry.sdk.trace.export.ConsoleSpanExporter に渡す
(strands/telemetry/config.py setup_console_exporter, strands-agents 1.48.0).
ConsoleSpanExporter は out (stream) と formatter を受けるので、
formatter を span.to_json(indent=None) + "\n" にして 1 行 1 JSON の jsonl を得る.
"""

from pathlib import Path

from strands.telemetry import StrandsTelemetry


def setup_jsonl_tracing(run_dir: Path, filename: str = "trace.jsonl") -> Path:
    """run_dir/trace.jsonl に span を 1 行 1 JSON で追記するトレーサを設定する."""
    trace_path = run_dir / filename
    out = open(trace_path, "a", encoding="utf-8")  # noqa: SIM115 - プロセス終了まで開きっぱなしで良い
    StrandsTelemetry().setup_console_exporter(
        out=out,
        formatter=lambda span: span.to_json(indent=None) + "\n",
    )
    return trace_path
