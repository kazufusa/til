"""exp02 process2: 別プロセスで同一 session_id を開き、文脈引き継ぎを確認する.

使い方: uv run python src/exp02_session_p2.py <session_id> <sessions_dir>
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.llm import make_model
from common.runs import current_run_dir
from common.tracing import setup_jsonl_tracing

from strands import Agent
from strands.session.file_session_manager import FileSessionManager


def main() -> None:
    session_id, sessions_dir = sys.argv[1], sys.argv[2]
    run_dir = current_run_dir("session", "resume-p2")
    setup_jsonl_tracing(run_dir)
    print(f"run_dir: {run_dir}")

    sm = FileSessionManager(session_id=session_id, storage_dir=sessions_dir)
    agent = Agent(
        model=make_model(),
        session_manager=sm,
        system_prompt="You are a concise assistant.",
        callback_handler=None,
    )
    print(f"p2 restored message count (before ask): {len(agent.messages)}")
    result = agent("What is my favorite secret keyword? Answer with the keyword only.")
    print(f"p2 stop_reason: {result.stop_reason}")
    print(f"p2 response: {result}")
    ok = "AOZORA-1234" in str(result)
    print(f"CONTEXT_CARRIED_OVER: {ok}")


if __name__ == "__main__":
    main()
