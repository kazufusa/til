"""構成A のワークフロー定義 (宣言的データ構造) とステップ実装.

ワークフロー定義はステップ列 + 差戻しエッジ + ループ上限を dataclass で持つ。
エンジン (engine.py) はこの定義だけを見て遷移する。

題材: 新製品発表のお知らせ文 (日本語 200 字以内、キーワード「SkyLine X1」必須)。
"""

import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from common.llm import make_model

from strands import Agent

KEYWORD = "SkyLine X1"
MAX_CHARS = 200
TABOO_WORD = "ヤバい"
FOOTER = "\n---\n本件に関するお問い合わせ先: 株式会社Example 広報部 pr@example.com"


@dataclass(frozen=True)
class Step:
    name: str
    kind: str                     # "agent" / "static" / "human"
    on_reject: str | None = None  # 差戻し先ステップ名 (None なら差戻しなし)
    counts_toward_limit: bool = True  # 差戻しがループ上限にカウントされるか


@dataclass(frozen=True)
class WorkflowDef:
    name: str
    steps: tuple[Step, ...]
    max_revisions: int  # 静的チェック + checker 合算の差戻し上限

    def index_of(self, step_name: str) -> int:
        for i, s in enumerate(self.steps):
            if s.name == step_name:
                return i
        raise KeyError(step_name)


ANNOUNCEMENT_WORKFLOW = WorkflowDef(
    name="announcement",
    steps=(
        Step("writer", "agent"),
        Step("static_check", "static", on_reject="writer"),
        Step("checker", "agent", on_reject="writer"),
        # 人間 NG はループ上限に数えない (レビューサイクルは別勘定)
        Step("human_review", "human", on_reject="writer", counts_toward_limit=False),
        Step("finalizer", "agent"),
    ),
    max_revisions=3,
)


def _run_agent(system_prompt: str, user_prompt: str) -> str:
    agent = Agent(model=make_model(), system_prompt=system_prompt,
                  callback_handler=None)
    return str(agent(user_prompt)).strip()


def run_writer(feedback: list[str], extra_instruction: str | None) -> str:
    """writer エージェント: お知らせ文を生成する."""
    system = (
        "あなたは企業の広報担当です。指示に従い、新製品発表のお知らせ文(日本語)だけを出力してください。"
        "前置きや説明は不要です。"
    )
    parts = [
        f"新製品「{KEYWORD}」の発表のお知らせ文を書いてください。",
        f"条件: 製品名「{KEYWORD}」を必ずこの表記のまま含める。全体で{MAX_CHARS}字以内。",
    ]
    if extra_instruction:
        parts.append(f"追加指示: {extra_instruction}")
    if feedback:
        parts.append("これまでの差戻し理由(必ず反映すること):")
        parts.extend(f"- {fb}" for fb in feedback)
    return _run_agent(system, "\n".join(parts))


def run_static_check(draft: str) -> tuple[bool, str]:
    """静的チェック (LLM 不使用): キーワード含有 AND 200 字以内."""
    problems = []
    if KEYWORD not in draft:
        problems.append(f"キーワード「{KEYWORD}」が含まれていない")
    if len(draft) > MAX_CHARS:
        problems.append(f"{len(draft)}字で上限{MAX_CHARS}字を超過")
    if problems:
        return False, "静的チェックNG: " + " / ".join(problems)
    return True, f"静的チェックOK: {len(draft)}字, キーワードあり"


def run_checker(draft: str) -> tuple[bool, str]:
    """checker エージェント: お知らせ文として適切か OK/NG + 理由."""
    system = (
        "あなたは広報文の校閲担当です。与えられた文が企業の公式なお知らせ文として適切か判定します。"
        "判定ルール: 俗語・くだけた表現(例:「ヤバい」「マジで」)や誇大表現が含まれていたら必ずNG。"
        "それ以外で、丁寧な告知文になっていればOK。"
        "出力形式: 1行目に OK または NG のみ。2行目に理由を1文で書く。"
    )
    verdict = _run_agent(system, f"次のお知らせ文を判定してください:\n\n{draft}")
    first_line = verdict.splitlines()[0].strip().upper() if verdict else ""
    ok = first_line.startswith("OK")
    return ok, f"checker判定: {verdict}"


def run_finalizer(draft: str) -> str:
    """finalizer エージェント: 承認済み文面に定型フッターを付けて出力."""
    system = (
        "あなたは広報文の最終整形担当です。与えられた承認済みのお知らせ文を一切変更せず、"
        "その直後に指定されたフッターをそのまま付けて出力してください。他の文言は追加しないこと。"
    )
    user = f"承認済み文面:\n{draft}\n\n付けるフッター:{FOOTER}"
    return _run_agent(system, user)
