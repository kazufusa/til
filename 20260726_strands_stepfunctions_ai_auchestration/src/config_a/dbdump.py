"""DB 状態ダンプ (レポート用). 使い方: uv run python src/config_a/dbdump.py [workflow_id]"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config_a import db


def dump(sql: str, params: tuple = ()) -> None:
    conn = db.connect()
    rows = conn.execute(sql, params).fetchall()
    print(f"-- {sql}")
    for r in rows:
        print(dict(r))
    print()


def main() -> None:
    wf_filter = ""
    params: tuple = ()
    if len(sys.argv) > 1:
        wf_filter = " WHERE id = ?"
        params = (int(sys.argv[1]),)
        dump("SELECT id, run_name, status, current_step, revision_count, "
             "draft, feedback, final_output FROM workflows" + wf_filter, params)
        dump("SELECT id, step_name, attempt, status, output, started_at, finished_at "
             "FROM step_attempts WHERE workflow_id = ? ORDER BY id", params)
        dump("SELECT * FROM human_reviews WHERE workflow_id = ? ORDER BY id", params)
    else:
        dump("SELECT id, run_name, status, current_step, revision_count "
             "FROM workflows ORDER BY id")
        dump("SELECT id, workflow_id, step_name, attempt, status "
             "FROM step_attempts ORDER BY id")
        dump("SELECT * FROM human_reviews ORDER BY id")


if __name__ == "__main__":
    main()
