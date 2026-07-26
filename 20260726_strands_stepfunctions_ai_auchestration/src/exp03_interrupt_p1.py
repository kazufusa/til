"""exp03 process1: interrupt が発生した状態でプロセスを終了する.

使い方: uv run python src/exp03_interrupt_p1.py <session_id> <sessions_dir>
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.runs import current_run_dir
from common.tracing import setup_jsonl_tracing
from exp03_common import build_agent


def main() -> None:
    session_id, sessions_dir = sys.argv[1], sys.argv[2]
    run_dir = current_run_dir("interrupt", "p1")
    setup_jsonl_tracing(run_dir)
    print(f"run_dir: {run_dir}")

    agent = build_agent(session_id, sessions_dir)
    result = agent("Apply the change with id 'CHG-42'.")
    print(f"p1 stop_reason: {result.stop_reason}")
    for itr in result.interrupts:
        print(f"p1 interrupt: id={itr.id} name={itr.name} reason={itr.reason}")
    print("p1 exiting process WITHOUT responding to the interrupt")


if __name__ == "__main__":
    main()
