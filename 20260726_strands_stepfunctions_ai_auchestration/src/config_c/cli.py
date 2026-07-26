"""構成C CLI: start / review / resume.

使い方 (プロジェクトルートから):
  uv run python src/config_c/cli.py start <run名> [--model haiku:latest]
  uv run python src/config_c/cli.py review <session_id> ok|ng [--comment "..."]
  uv run python src/config_c/cli.py resume <session_id>

設計:
- session_id は run名 と同一。FileSessionManager は .sessions/ 配下に永続化。
- レビュー結果は .sessions/review_<session_id>.json に置き (review コマンドが書く)、
  resume コマンドが読み取って interruptResponse として注入し、消費 (削除) する。
- run_dir は start が .sessions/configc_runmap_<session_id>.json に記録し、
  resume が同じ run_dir にトレースを追記する (STRANDS_EXP_RUN_DIR でも上書き可)。
"""

import argparse
import json
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SRC))

from common.runs import PROJECT_ROOT, current_run_dir
from common.tracing import setup_jsonl_tracing
from config_c.workflow import build_orchestrator, init_workflow

SESSIONS_DIR = PROJECT_ROOT / ".sessions"

INITIAL_PROMPT = (
    "新製品 SkyLine X1 の発表お知らせ文を作成するワークフローを実行してください。"
)


def runmap_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"configc_runmap_{session_id}.json"


def review_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"review_{session_id}.json"


def report(result, session_id: str) -> None:
    print(f"stop_reason: {result.stop_reason}")
    if result.stop_reason == "interrupt":
        for itr in result.interrupts:
            print(f"pending interrupt: id={itr.id} name={itr.name}")
            print(f"  reason: {json.dumps(itr.reason, ensure_ascii=False)}")
        print("人間確認待ちで中断した。次を実行:")
        print(f"  review {session_id} ok|ng [--comment ...] してから resume {session_id}")
    else:
        print(f"final response:\n{result}")


def cmd_start(args) -> None:
    session_id = args.run_name
    run_dir = current_run_dir("configc", args.run_name)
    setup_jsonl_tracing(run_dir)
    runmap_path(session_id).write_text(
        json.dumps({"run_dir": str(run_dir), "model_id": args.model}), encoding="utf-8"
    )
    print(f"run_dir: {run_dir}")
    print(f"session_id: {session_id}")

    init_workflow(run_dir)
    agent = build_orchestrator(session_id, str(SESSIONS_DIR), args.model)
    result = agent(INITIAL_PROMPT)
    report(result, session_id)


def cmd_review(args) -> None:
    decision = args.decision if not args.comment else f"{args.decision}: {args.comment}"
    review_path(args.session_id).write_text(
        json.dumps({"decision": decision}, ensure_ascii=False), encoding="utf-8"
    )
    print(f"review recorded for {args.session_id}: {decision}")


def cmd_resume(args) -> None:
    session_id = args.session_id
    runmap = json.loads(runmap_path(session_id).read_text(encoding="utf-8"))
    run_dir = Path(runmap["run_dir"])
    setup_jsonl_tracing(run_dir)
    print(f"run_dir: {run_dir}")

    rp = review_path(session_id)
    if not rp.exists():
        print(f"ERROR: レビュー結果が未登録。先に review {session_id} ok|ng を実行せよ。")
        sys.exit(1)
    decision = json.loads(rp.read_text(encoding="utf-8"))["decision"]

    init_workflow(run_dir)
    agent = build_orchestrator(session_id, str(SESSIONS_DIR), runmap["model_id"])
    state = agent._interrupt_state
    print(f"restored interrupt_state.activated: {state.activated}")
    if not state.activated:
        print("pending interrupt がない。resume 不要。")
        return

    responses = [
        {"interruptResponse": {"interruptId": iid, "response": decision}}
        for iid in state.interrupts
    ]
    print(f"injecting decision {decision!r} into {len(responses)} interrupt(s)")
    rp.unlink()  # レビュー結果を消費。再度 interrupt したら新たなレビューが必要
    result = agent(responses)
    report(result, session_id)


def main() -> None:
    p = argparse.ArgumentParser(description="構成C オーケストレータAI CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("start")
    sp.add_argument("run_name")
    sp.add_argument("--model", default="haiku:latest")
    sp.set_defaults(func=cmd_start)

    sp = sub.add_parser("review")
    sp.add_argument("session_id")
    sp.add_argument("decision", choices=["ok", "ng"])
    sp.add_argument("--comment", default="")
    sp.set_defaults(func=cmd_review)

    sp = sub.add_parser("resume")
    sp.add_argument("session_id")
    sp.set_defaults(func=cmd_resume)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
