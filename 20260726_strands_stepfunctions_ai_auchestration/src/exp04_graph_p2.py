"""exp04 process2: 別プロセスで同一 session の Graph を再構築し、OK/NG を注入して再開する.

使い方: uv run python src/exp04_graph_p2.py <session_id> <sessions_dir> <OK|NG>
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.runs import current_run_dir
from common.tracing import setup_jsonl_tracing
from exp04_common import build_graph


def main() -> None:
    session_id, sessions_dir, decision = sys.argv[1], sys.argv[2], sys.argv[3]
    run_dir = current_run_dir("graph-interrupt", "p2")
    setup_jsonl_tracing(run_dir)
    print(f"run_dir: {run_dir}")

    graph = build_graph(session_id, sessions_dir)
    state = graph._interrupt_state
    print(f"p2 restored interrupt_state.activated: {state.activated}")
    print(f"p2 pending interrupts: {[(i.id, i.name, i.reason) for i in state.interrupts.values()]}")
    if not state.activated:
        print("no pending interrupt; nothing to resume")
        return

    answer = "OK" if decision == "OK" else "NG: wording is off-brand"
    responses = [
        {"interruptResponse": {"interruptId": interrupt_id, "response": answer}}
        for interrupt_id in state.interrupts
    ]
    result = graph(responses)
    print(f"p2 status: {result.status}")
    print(f"p2 completed_nodes: {result.completed_nodes}")
    for node_id, node_result in result.results.items():
        print(f"p2 node={node_id} status={node_result.status} result={str(node_result.result)[:200]!r}")


if __name__ == "__main__":
    main()
