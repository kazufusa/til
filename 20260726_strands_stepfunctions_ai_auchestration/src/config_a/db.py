"""構成A の sqlite3 永続化層.

スキーマ:
- workflows: ワークフローインスタンス 1 件 = 1 行。現在ステップ・状態・草稿・
  フィードバック履歴 (JSON 配列)・差戻し回数を保持する
- step_attempts: 各ステップの実行 1 回 = 1 行。入出力とステータスを保存
- human_reviews: 人間レビューの判定 1 回 = 1 行 (ok/ng + コメント)
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = PROJECT_ROOT / "data" / "config_a.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS workflows (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    run_name       TEXT NOT NULL,
    run_dir        TEXT NOT NULL,
    status         TEXT NOT NULL,           -- running / waiting_human / escalated / completed
    current_step   TEXT NOT NULL,           -- ワークフロー定義上のステップ名
    revision_count INTEGER NOT NULL DEFAULT 0,
    draft          TEXT,                    -- writer の最新出力
    feedback       TEXT NOT NULL DEFAULT '[]',  -- 差戻し理由の JSON 配列
    extra_writer_instruction TEXT,          -- 実験用: writer への追加指示 (NG 誘発)
    persist_extra  INTEGER NOT NULL DEFAULT 0,  -- 1 なら追加指示を差戻し後も維持
    final_output   TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS step_attempts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER NOT NULL REFERENCES workflows(id),
    step_name   TEXT NOT NULL,
    attempt     INTEGER NOT NULL,           -- 同一ステップ何回目の実行か (1 始まり)
    status      TEXT NOT NULL,              -- ok / rejected / error
    input       TEXT,
    output      TEXT,
    started_at  TEXT NOT NULL,
    finished_at TEXT
);
CREATE TABLE IF NOT EXISTS human_reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER NOT NULL REFERENCES workflows(id),
    decision    TEXT NOT NULL,              -- ok / ng
    comment     TEXT,
    consumed    INTEGER NOT NULL DEFAULT 0, -- resume で処理済みなら 1
    created_at  TEXT NOT NULL
);
"""


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def create_workflow(conn: sqlite3.Connection, run_name: str, run_dir: str,
                    first_step: str, extra_writer_instruction: str | None,
                    persist_extra: bool) -> int:
    cur = conn.execute(
        "INSERT INTO workflows (run_name, run_dir, status, current_step, "
        " extra_writer_instruction, persist_extra, created_at, updated_at) "
        "VALUES (?, ?, 'running', ?, ?, ?, ?, ?)",
        (run_name, run_dir, first_step, extra_writer_instruction,
         int(persist_extra), now(), now()),
    )
    conn.commit()
    return cur.lastrowid


def load_workflow(conn: sqlite3.Connection, wf_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM workflows WHERE id = ?", (wf_id,)).fetchone()
    if row is None:
        raise SystemExit(f"workflow {wf_id} not found")
    return row


def update_workflow(conn: sqlite3.Connection, wf_id: int, **fields) -> None:
    fields["updated_at"] = now()
    sets = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(f"UPDATE workflows SET {sets} WHERE id = ?",
                 (*fields.values(), wf_id))
    conn.commit()


def start_attempt(conn: sqlite3.Connection, wf_id: int, step_name: str,
                  input_text: str) -> int:
    attempt = conn.execute(
        "SELECT COUNT(*) FROM step_attempts WHERE workflow_id = ? AND step_name = ?",
        (wf_id, step_name),
    ).fetchone()[0] + 1
    cur = conn.execute(
        "INSERT INTO step_attempts (workflow_id, step_name, attempt, status, input, started_at) "
        "VALUES (?, ?, ?, 'running', ?, ?)",
        (wf_id, step_name, attempt, input_text, now()),
    )
    conn.commit()
    return cur.lastrowid


def finish_attempt(conn: sqlite3.Connection, attempt_id: int, status: str,
                   output: str) -> None:
    conn.execute(
        "UPDATE step_attempts SET status = ?, output = ?, finished_at = ? WHERE id = ?",
        (status, output, now(), attempt_id),
    )
    conn.commit()


def add_review(conn: sqlite3.Connection, wf_id: int, decision: str,
               comment: str | None) -> int:
    cur = conn.execute(
        "INSERT INTO human_reviews (workflow_id, decision, comment, created_at) "
        "VALUES (?, ?, ?, ?)",
        (wf_id, decision, comment, now()),
    )
    conn.commit()
    return cur.lastrowid


def latest_unconsumed_review(conn: sqlite3.Connection, wf_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM human_reviews WHERE workflow_id = ? AND consumed = 0 "
        "ORDER BY id DESC LIMIT 1",
        (wf_id,),
    ).fetchone()


def consume_review(conn: sqlite3.Connection, review_id: int) -> None:
    conn.execute("UPDATE human_reviews SET consumed = 1 WHERE id = ?", (review_id,))
    conn.commit()


def get_feedback(row: sqlite3.Row) -> list[str]:
    return json.loads(row["feedback"])


def feedback_json(items: list[str]) -> str:
    return json.dumps(items, ensure_ascii=False)
