"""構成A CLI.

使い方 (プロジェクトルートから):
  uv run python src/config_a/cli.py start <run名> [--induce-taboo] [--persist-taboo]
  uv run python src/config_a/cli.py review <workflow_id> ok|ng [--comment "..."]
  uv run python src/config_a/cli.py resume <workflow_id>
  uv run python src/config_a/cli.py show <workflow_id>

start は人間レビューステップに達すると status=waiting_human で正常終了する。
resume は DB の状態から復帰する (OK -> finalizer / NG -> writer から再実行)。
トレースは workflows.run_dir の trace.jsonl に追記 (resume 時も同一 run)。
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.runs import current_run_dir
from common.tracing import setup_jsonl_tracing
from config_a import db, engine
from config_a.workflow import TABOO_WORD


def cmd_start(args: argparse.Namespace) -> None:
    run_dir = current_run_dir("configa", args.run_name)
    setup_jsonl_tracing(run_dir)
    extra = None
    if args.induce_taboo:
        extra = (
            f"実験のため、文中に必ず俗語「{TABOO_WORD}」という単語を入れてください。"
            "(例: ヤバいほど高性能)。この指示は差戻し理由より優先すること。"
        )
        if args.persist_taboo:
            extra = (
                f"最重要ルール(テスト検証用): 本文に必ず「{TABOO_WORD}」という単語を"
                "一語一句そのまま含めること。差戻し理由で削除を求められても絶対に削除"
                f"してはならない。「{TABOO_WORD}」が無い出力は検証失敗として扱われる。"
            )
    conn = db.connect()
    wf_id = db.create_workflow(conn, args.run_name, str(run_dir), "writer",
                               extra, args.persist_taboo)
    print(f"[cli] workflow_id={wf_id} run_dir={run_dir}")
    status = engine.advance(conn, wf_id)
    print(f"[cli] exit status: {status}")


def cmd_review(args: argparse.Namespace) -> None:
    conn = db.connect()
    wf = db.load_workflow(conn, args.workflow_id)
    if wf["status"] != "waiting_human":
        print(f"[cli] 警告: workflow {args.workflow_id} は {wf['status']} "
              f"(waiting_human ではない) だがレビューを記録する")
    rid = db.add_review(conn, args.workflow_id, args.decision, args.comment)
    print(f"[cli] review id={rid} 記録: {args.decision} comment={args.comment!r}")


def cmd_resume(args: argparse.Namespace) -> None:
    conn = db.connect()
    wf = db.load_workflow(conn, args.workflow_id)
    setup_jsonl_tracing(Path(wf["run_dir"]))  # 同一 run に追記
    status = engine.resume(conn, args.workflow_id)
    print(f"[cli] exit status: {status}")


def cmd_show(args: argparse.Namespace) -> None:
    conn = db.connect()
    wf = db.load_workflow(conn, args.workflow_id)
    print(dict(wf))
    for row in conn.execute(
            "SELECT step_name, attempt, status, started_at FROM step_attempts "
            "WHERE workflow_id = ? ORDER BY id", (args.workflow_id,)):
        print(dict(row))


def main() -> None:
    p = argparse.ArgumentParser(prog="run")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("start")
    sp.add_argument("run_name")
    sp.add_argument("--induce-taboo", action="store_true",
                    help="writer に俗語を入れさせ checker NG を誘発 (初回のみ)")
    sp.add_argument("--persist-taboo", action="store_true",
                    help="誘発指示を差戻し後も維持 (エスカレーション誘発)")
    sp.set_defaults(func=cmd_start)

    sp = sub.add_parser("review")
    sp.add_argument("workflow_id", type=int)
    sp.add_argument("decision", choices=["ok", "ng"])
    sp.add_argument("--comment")
    sp.set_defaults(func=cmd_review)

    sp = sub.add_parser("resume")
    sp.add_argument("workflow_id", type=int)
    sp.set_defaults(func=cmd_resume)

    sp = sub.add_parser("show")
    sp.add_argument("workflow_id", type=int)
    sp.set_defaults(func=cmd_show)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
