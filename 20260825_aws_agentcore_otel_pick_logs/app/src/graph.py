"""Strands Graph本体: writer -> reviewer -> gate。

ローカル実験(scripts/local_run.py)とクラウド(app.py)で共通に使う。
"""

import os
import time
from dataclasses import dataclass, field
from typing import Any

from opentelemetry import trace as trace_api
from strands import Agent
from strands.models import BedrockModel
from strands.multiagent import GraphBuilder
from strands.multiagent.base import MultiAgentBase, MultiAgentResult, NodeResult, Status

# 既定はClaude Haiku。Anthropicユースケースフォーム提出前の検証は
# MODEL_ID環境変数でNova(apac.amazon.nova-lite-v1:0)へ差し替える
MODEL_ID = os.environ.get("MODEL_ID", "jp.anthropic.claude-haiku-4-5-20251001-v1:0")
REGION = os.environ.get("AWS_REGION", "ap-northeast-1")

WRITER_SYSTEM = "あなたは技術ライターです。指示された題材を正確で簡潔な日本語で説明します。"
REVIEWER_SYSTEM = (
    "あなたは編集者です。渡された文章を、意味を変えずにより簡潔な日本語へ推敲します。"
    "推敲後の本文だけを出力します。"
)

WRITER_PROMPT_TEMPLATE = """次の題材について3文で説明してください。

題材: {topic}

参考資料:
{prompt_payload}
"""


def _last_assistant_text(agent: Agent) -> str:
    """Agentの最後のassistantメッセージからテキストを取り出す。"""
    for message in reversed(agent.messages):
        if message.get("role") == "assistant":
            return "".join(
                block.get("text", "")
                for block in message.get("content", [])
                if isinstance(block, dict)
            )
    return ""


class GateNode(MultiAgentBase):
    """機械的な検証ゲート。reviewer出力の文字数をしきい値と比較する。

    判定内容(評価対象・判断基準・判断結果)をOTELスパン属性として記録する。
    """

    def __init__(self, reviewer: Agent, min_length: int) -> None:
        super().__init__()
        self.id = "gate"
        self._reviewer = reviewer
        self._min_length = min_length
        self.verdict: dict[str, Any] = {}

    async def invoke_async(
        self, task: Any, invocation_state: dict[str, Any] | None = None, **kwargs: Any
    ) -> MultiAgentResult:
        started = time.time()
        evaluated_text = _last_assistant_text(self._reviewer)
        criteria = f"len(reviewer_output) >= {self._min_length}"
        passed = len(evaluated_text) >= self._min_length

        tracer = trace_api.get_tracer("verification-gate")
        with tracer.start_as_current_span("verification_gate") as span:
            span.set_attribute("gate.evaluated_text", evaluated_text)
            span.set_attribute("gate.evaluated_length", len(evaluated_text))
            span.set_attribute("gate.criteria", criteria)
            span.set_attribute("gate.min_length", self._min_length)
            span.set_attribute("gate.result", "PASS" if passed else "FAIL")

        self.verdict = {
            "result": "PASS" if passed else "FAIL",
            "evaluated_length": len(evaluated_text),
            "criteria": criteria,
            "min_length": self._min_length,
        }

        elapsed_ms = round((time.time() - started) * 1000)
        inner = MultiAgentResult(status=Status.COMPLETED, results={})
        node_result = NodeResult(
            result=inner, status=Status.COMPLETED, execution_time=elapsed_ms
        )
        return MultiAgentResult(
            status=Status.COMPLETED,
            results={"gate": node_result},
            execution_time=elapsed_ms,
        )


@dataclass
class GraphRunOutcome:
    gate_passed: bool
    gate_verdict: dict[str, Any]
    final_text: str
    completed_nodes: list[str] = field(default_factory=list)


def run_graph(topic: str, prompt_payload: str, gate_min_length: int) -> GraphRunOutcome:
    """Graphを1回実行し、gateの判定と最終出力を返す。"""
    # streaming=False: サーバー応答が1回のConverseで完結し、OTEL記録の
    # 比較がしやすい。Claude切り替え時のフォーム未提出エラー回避も兼ねる
    model = BedrockModel(model_id=MODEL_ID, region_name=REGION, streaming=False)
    writer = Agent(
        name="writer", model=model, system_prompt=WRITER_SYSTEM, callback_handler=None
    )
    reviewer = Agent(
        name="reviewer", model=model, system_prompt=REVIEWER_SYSTEM, callback_handler=None
    )
    gate = GateNode(reviewer, gate_min_length)

    builder = GraphBuilder()
    builder.add_node(writer, "writer")
    builder.add_node(reviewer, "reviewer")
    builder.add_node(gate, "gate")
    builder.add_edge("writer", "reviewer")
    builder.add_edge("reviewer", "gate")
    builder.set_entry_point("writer")
    graph = builder.build()

    task = WRITER_PROMPT_TEMPLATE.format(topic=topic, prompt_payload=prompt_payload)
    result = graph(task)

    return GraphRunOutcome(
        gate_passed=gate.verdict.get("result") == "PASS",
        gate_verdict=gate.verdict,
        final_text=_last_assistant_text(reviewer),
        completed_nodes=list(result.results.keys()),
    )
