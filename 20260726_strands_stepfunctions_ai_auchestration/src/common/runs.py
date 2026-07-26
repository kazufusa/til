"""実験 run 管理.

規約: runs/<YYYYmmdd-HHMMSS>-<構成名>-<run名>/ に成果物 (trace.jsonl 等) を保存する.
既存 run の再利用 (2 プロセス実験でトレースを同じ run に落とす) は
STRANDS_EXP_RUN_DIR 環境変数で run dir を引き継ぐ.
"""

import os
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
RUNS_ROOT = PROJECT_ROOT / "runs"


def new_run_dir(config_name: str, run_name: str) -> Path:
    """新しい run ディレクトリを作成して返す."""
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir = RUNS_ROOT / f"{ts}-{config_name}-{run_name}"
    run_dir.mkdir(parents=True, exist_ok=False)
    return run_dir


def current_run_dir(config_name: str, run_name: str) -> Path:
    """環境変数 STRANDS_EXP_RUN_DIR があればそれを、なければ新規 run dir を返す."""
    env = os.getenv("STRANDS_EXP_RUN_DIR")
    if env:
        run_dir = Path(env)
        run_dir.mkdir(parents=True, exist_ok=True)
        return run_dir
    return new_run_dir(config_name, run_name)
