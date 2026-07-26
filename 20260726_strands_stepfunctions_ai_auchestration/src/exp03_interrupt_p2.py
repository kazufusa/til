"""exp03 process2: 別プロセスで同一 session を開き、人間の OK/NG を注入して再開する.

使い方: uv run python src/exp03_interrupt_p2.py <session_id> <sessions_dir> <OK|NG>

pending interrupt の id は session から復元された agent._interrupt_state から取得する
(人間レビューシステムがストアから未処理承認を読む動きの模擬).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.runs import current_run_dir
from common.tracing import setup_jsonl_tracing
from exp03_common import APPLIED_MARKER, build_agent


def main() -> None:
    session_id, sessions_dir, decision = sys.argv[1], sys.argv[2], sys.argv[3]
    run_dir = current_run_dir("interrupt", "p2")
    setup_jsonl_tracing(run_dir)
    print(f"run_dir: {run_dir}")

    agent = build_agent(session_id, sessions_dir)
    state = agent._interrupt_state
    print(f"p2 restored interrupt_state.activated: {state.activated}")
    print(f"p2 pending interrupts: {[ (i.id, i.name, i.reason) for i in state.interrupts.values() ]}")
    if not state.activated:
        print("no pending interrupt; nothing to resume")
        return

    answer = "OK" if decision == "OK" else "NG: too risky"
    # モデルがツールを再度呼んで再 interrupt する可能性に備え、最大 3 回まで応答を繰り返す
    for attempt in range(3):
        responses = [
            {"interruptResponse": {"interruptId": interrupt_id, "response": answer}}
            for interrupt_id in agent._interrupt_state.interrupts
        ]
        result = agent(responses)
        print(f"p2 attempt={attempt} stop_reason: {result.stop_reason}")
        if result.stop_reason != "interrupt":
            break
    print(f"p2 response: {result}")
    print(f"p2 tool actually executed (marker file exists): {APPLIED_MARKER.exists()}")
    if APPLIED_MARKER.exists():
        print(f"p2 marker content: {APPLIED_MARKER.read_text().strip()}")


if __name__ == "__main__":
    main()
