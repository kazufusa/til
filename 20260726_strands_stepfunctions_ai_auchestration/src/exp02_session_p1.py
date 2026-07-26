"""exp02 process1: FileSessionManager で会話を永続化してプロセス終了.

使い方: uv run python src/exp02_session_p1.py <session_id> <sessions_dir>
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
    run_dir = current_run_dir("session", "resume-p1")
    setup_jsonl_tracing(run_dir)
    print(f"run_dir: {run_dir}")

    sm = FileSessionManager(session_id=session_id, storage_dir=sessions_dir)
    agent = Agent(
        model=make_model(),
        session_manager=sm,
        system_prompt="You are a concise assistant.",
        callback_handler=None,
    )
    result = agent(
        "My favorite secret keyword is 'AOZORA-1234'. Just acknowledge it briefly."
    )
    print(f"p1 stop_reason: {result.stop_reason}")
    print(f"p1 response: {result}")
    print(f"p1 message count: {len(agent.messages)}")


if __name__ == "__main__":
    main()
