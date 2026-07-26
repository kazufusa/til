"""exp01: LLM 疎通確認 + otel jsonl トレース確認.

OpenAIModel (base_url=http://localhost:11434/v1) で最小エージェントを 1 回実行し、
runs/<ts>-openai-smoke/trace.jsonl に span が落ちることを確認する.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.llm import make_model
from common.runs import current_run_dir
from common.tracing import setup_jsonl_tracing

from strands import Agent


def main() -> None:
    run_dir = current_run_dir("openai", "smoke")
    trace_path = setup_jsonl_tracing(run_dir)
    print(f"run_dir: {run_dir}")

    agent = Agent(
        model=make_model(),
        system_prompt="You are a concise assistant. Answer in one short sentence.",
        callback_handler=None,
    )
    result = agent("Reply with exactly: PONG")
    print(f"stop_reason: {result.stop_reason}")
    print(f"response: {result}")
    print(f"trace file: {trace_path}")


if __name__ == "__main__":
    main()
