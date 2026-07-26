"""exp04 process1: Graph 実行が publisher 前で interrupt した状態でプロセス終了.

使い方: uv run python src/exp04_graph_p1.py <session_id> <sessions_dir>
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.runs import current_run_dir
from common.tracing import setup_jsonl_tracing
from exp04_common import build_graph


def main() -> None:
    session_id, sessions_dir = sys.argv[1], sys.argv[2]
    run_dir = current_run_dir("graph-interrupt", "p1")
    setup_jsonl_tracing(run_dir)
    print(f"run_dir: {run_dir}")

    graph = build_graph(session_id, sessions_dir)
    result = graph("New feature: dark mode for the dashboard")
    print(f"p1 status: {result.status}")
    print(f"p1 completed_nodes: {result.completed_nodes}, interrupted_nodes: {result.interrupted_nodes}")
    for itr in result.interrupts:
        print(f"p1 interrupt: id={itr.id} name={itr.name} reason={itr.reason}")
    print("p1 exiting process WITHOUT responding to the interrupt")


if __name__ == "__main__":
    main()
