"""構成A の自前ワークフローエンジン.

sqlite3 上の workflow 状態 (current_step / revision_count / draft / feedback) を
読み書きしながら、workflow.py の宣言的定義 (WorkflowDef) に従ってステップを進める。
human ステップに到達したら status=waiting_human で停止し、プロセスは正常終了する。
差戻し (static/checker) は上限 max_revisions 回まで。超過で status=escalated。
"""

import sqlite3

from config_a import db
from config_a.workflow import (
    ANNOUNCEMENT_WORKFLOW,
    WorkflowDef,
    run_checker,
    run_finalizer,
    run_static_check,
    run_writer,
)


def advance(conn: sqlite3.Connection, wf_id: int,
            defn: WorkflowDef = ANNOUNCEMENT_WORKFLOW) -> str:
    """current_step から実行を進め、停止時の status を返す."""
    while True:
        wf = db.load_workflow(conn, wf_id)
        idx = defn.index_of(wf["current_step"])
        step = defn.steps[idx]
        feedback = db.get_feedback(wf)

        if step.kind == "human":
            db.update_workflow(conn, wf_id, status="waiting_human")
            print(f"[engine] wf={wf_id} step={step.name}: 人間レビュー待ちで停止 "
                  f"(status=waiting_human)")
            return "waiting_human"

        if step.name == "writer":
            extra = wf["extra_writer_instruction"]
            input_text = f"feedback={feedback} extra={extra}"
            att = db.start_attempt(conn, wf_id, step.name, input_text)
            draft = run_writer(feedback, extra)
            db.finish_attempt(conn, att, "ok", draft)
            fields = {"draft": draft}
            if extra and not wf["persist_extra"]:
                fields["extra_writer_instruction"] = None  # 誘発指示は初回のみ
            db.update_workflow(conn, wf_id, **fields)
            print(f"[engine] wf={wf_id} writer 生成 ({len(draft)}字): {draft[:60]}...")
            ok, detail = True, draft

        elif step.name == "static_check":
            att = db.start_attempt(conn, wf_id, step.name, wf["draft"])
            ok, detail = run_static_check(wf["draft"])
            db.finish_attempt(conn, att, "ok" if ok else "rejected", detail)
            print(f"[engine] wf={wf_id} static_check: {detail}")

        elif step.name == "checker":
            att = db.start_attempt(conn, wf_id, step.name, wf["draft"])
            ok, detail = run_checker(wf["draft"])
            db.finish_attempt(conn, att, "ok" if ok else "rejected", detail)
            print(f"[engine] wf={wf_id} checker: {'OK' if ok else 'NG'} ({detail[:80]})")

        elif step.name == "finalizer":
            att = db.start_attempt(conn, wf_id, step.name, wf["draft"])
            final = run_finalizer(wf["draft"])
            db.finish_attempt(conn, att, "ok", final)
            db.update_workflow(conn, wf_id, status="completed",
                               current_step=step.name, final_output=final)
            print(f"[engine] wf={wf_id} 完了。最終成果物:\n{final}")
            return "completed"

        else:
            raise RuntimeError(f"unknown step: {step.name}")

        if ok:
            next_step = defn.steps[idx + 1].name
            db.update_workflow(conn, wf_id, current_step=next_step)
            continue

        # 差戻し
        revision = wf["revision_count"]
        if step.counts_toward_limit:
            revision += 1
        if revision > defn.max_revisions:
            db.update_workflow(conn, wf_id, status="escalated",
                               revision_count=revision)
            print(f"[engine] wf={wf_id} 差戻し上限 {defn.max_revisions} 回超過。"
                  f"エスカレーション (status=escalated) で停止")
            return "escalated"
        feedback.append(detail)
        db.update_workflow(conn, wf_id, current_step=step.on_reject,
                           revision_count=revision,
                           feedback=db.feedback_json(feedback))
        print(f"[engine] wf={wf_id} {step.name} NG -> {step.on_reject} へ差戻し "
              f"(revision={revision}/{defn.max_revisions})")


def resume(conn: sqlite3.Connection, wf_id: int,
           defn: WorkflowDef = ANNOUNCEMENT_WORKFLOW) -> str:
    """waiting_human から人間レビュー結果に応じて復帰する.

    OK -> finalizer へ進む。
    NG -> コメントを feedback に注入し、revision_count をリセットして
          writer から再実行 (チェックループも再度通る)。P2-1 の採用方式。
    """
    wf = db.load_workflow(conn, wf_id)
    if wf["status"] == "running":
        print(f"[engine] wf={wf_id} は running。中断地点から続行します")
        return advance(conn, wf_id, defn)
    if wf["status"] != "waiting_human":
        raise SystemExit(
            f"workflow {wf_id} is {wf['status']}; resume できるのは waiting_human のみ")

    review = db.latest_unconsumed_review(conn, wf_id)
    if review is None:
        print(f"[engine] wf={wf_id} は人間レビュー待ちのまま (未レビュー)。"
              f"`run review {wf_id} ok|ng` を先に実行してください")
        return "waiting_human"

    db.consume_review(conn, review["id"])
    att = db.start_attempt(conn, wf_id, "human_review", wf["draft"])
    if review["decision"] == "ok":
        db.finish_attempt(conn, att, "ok", "human OK")
        db.update_workflow(conn, wf_id, status="running", current_step="finalizer")
        print(f"[engine] wf={wf_id} 人間レビュー OK -> finalizer へ")
    else:
        comment = review["comment"] or "(コメントなし)"
        db.finish_attempt(conn, att, "rejected", f"human NG: {comment}")
        feedback = db.get_feedback(wf)
        feedback.append(f"人間レビューNG: {comment}")
        db.update_workflow(conn, wf_id, status="running", current_step="writer",
                           revision_count=0, feedback=db.feedback_json(feedback))
        print(f"[engine] wf={wf_id} 人間レビュー NG -> コメント注入して writer から再実行")
    return advance(conn, wf_id, defn)
