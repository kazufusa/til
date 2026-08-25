"""AgentCore Runtime用エントリポイント。

Graphを実行し、gateがFAILのとき全OTELスパンをjsonlとしてS3へ保存する。
"""

import os
import time
from datetime import datetime, timezone

import boto3
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from opentelemetry import trace as trace_api
from opentelemetry.sdk.trace import TracerProvider as SDKTracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor

from graph import run_graph
from otel import InMemoryJsonlExporter

app = BedrockAgentCoreApp()
_memory_exporter = InMemoryJsonlExporter()


def _install_exporter() -> SDKTracerProvider:
    """自作エクスポータをTracerProviderへ追加する。

    ADOT自動計装が先にグローバルProviderを設定済みならそれへ相乗りする。
    未設定(ローカルでの直接起動など)ならStrandsTelemetryで新設する。
    """
    provider = trace_api.get_tracer_provider()
    if not isinstance(provider, SDKTracerProvider):
        from strands.telemetry import StrandsTelemetry

        provider = StrandsTelemetry().tracer_provider
    provider.add_span_processor(SimpleSpanProcessor(_memory_exporter))
    return provider


_provider = _install_exporter()


def _dump_to_s3(session_id: str | None) -> str:
    bucket = os.environ["OTEL_DUMP_BUCKET"]
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sid = session_id or "no-session"
    key = f"ng-dumps/{date}/{sid}_{int(time.time())}.jsonl"
    boto3.client("s3").put_object(
        Bucket=bucket,
        Key=key,
        Body=_memory_exporter.to_jsonl().encode("utf-8"),
        ContentType="application/x-ndjson",
    )
    return f"s3://{bucket}/{key}"


@app.entrypoint
def invoke(payload: dict, context=None) -> dict:
    _memory_exporter.clear()

    topic = payload.get("topic", "OpenTelemetryの分散トレーシング")
    prompt_payload = payload.get("prompt_payload", "")
    gate_min_length = int(payload.get("gate_min_length", 1))

    outcome = run_graph(topic, prompt_payload, gate_min_length)
    _provider.force_flush()

    dump_location = None
    if not outcome.gate_passed:
        dump_location = _dump_to_s3(getattr(context, "session_id", None))

    return {
        "gate": outcome.gate_verdict,
        "final_text": outcome.final_text,
        "completed_nodes": outcome.completed_nodes,
        "span_count": _memory_exporter.span_count(),
        "ng_dump": dump_location,
        "prompt_payload_chars": len(prompt_payload),
    }


if __name__ == "__main__":
    app.run()
