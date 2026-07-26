"""構成C: オーケストレータ AI (Strands Agent) による動的呼び分け.

- オーケストレータ Agent が system prompt にワークフロー定義・役割定義を持ち、
  各ステップ (writer/static_check/checker/human_review/finalizer/escalate) を
  ツールとして呼び分ける (Agents as Tools 型)。
- 非同期人間確認は request_human_review ツールへの BeforeToolCallEvent hook で
  interrupt を発火し、FileSessionManager で永続化 → プロセス終了 → 別プロセスで
  interruptResponse を注入して再開する (exp03 で実証済みのパターン)。
  ツール内 (子エージェント内) interrupt は入れ子 interrupt バグ
  (strands-agents Issue #3076) を踏む恐れがあるため採用しない。
- ワークフローの中間状態 (draft、ツール呼び出しログ) は run_dir/state.json に
  永続化し、プロセスまたぎで共有する。ツール間のデータ受け渡しは state 経由とし、
  LLM の転記ミスがフロー機構の検証を汚染しないようにする。
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from common.llm import make_model

from strands import Agent, tool
from strands.hooks import BeforeToolCallEvent, HookProvider, HookRegistry
from strands.session.file_session_manager import FileSessionManager

FOOTER = "\n---\n本件に関するお問い合わせ: 株式会社Example 広報部 (pr@example.com)"
KEYWORD = "SkyLine X1"
MAX_CHARS = 200
WRITER_HARD_CAP = 8  # LLM が上限 3 回を破って暴走した場合の安全弁 (破った事実は state に残る)

# ---------------------------------------------------------------------------
# ワークフロー状態 (run_dir/state.json に永続化、プロセスまたぎで共有)
# ---------------------------------------------------------------------------


class WorkflowState:
    def __init__(self, path: Path):
        self.path = path
        if path.exists():
            self.data = json.loads(path.read_text(encoding="utf-8"))
        else:
            self.data = {"draft": "", "final": "", "writer_calls": 0, "events": []}

    def record(self, tool_name: str, **detail: Any) -> None:
        self.data["events"].append(
            {"ts": datetime.now().isoformat(timespec="seconds"), "tool": tool_name, **detail}
        )
        self.save()

    def save(self) -> None:
        self.path.write_text(
            json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8"
        )


_STATE: WorkflowState | None = None
_RUN_DIR: Path | None = None
_PENDING_HUMAN: list[str] = []  # hook が interrupt 応答を積み、ツール本体が取り出す


def init_workflow(run_dir: Path) -> WorkflowState:
    global _STATE, _RUN_DIR
    _RUN_DIR = run_dir
    _STATE = WorkflowState(run_dir / "state.json")
    return _STATE


# ---------------------------------------------------------------------------
# 各ステップのツール実装
# ---------------------------------------------------------------------------


@tool
def run_writer(instruction: str = "") -> str:
    """writer エージェントを実行してお知らせ文の下書きを生成する。差戻し時は instruction に NG 理由・レビューコメントを渡す。"""
    _STATE.data["writer_calls"] += 1
    if _STATE.data["writer_calls"] > WRITER_HARD_CAP:
        _STATE.record("run_writer", note="HARD_CAP_EXCEEDED (safety stop)")
        return "ERROR: writer の呼び出し回数が安全上限を超えた。escalate を呼んでワークフローを終了せよ。"
    writer = Agent(
        model=make_model(),
        system_prompt=(
            "あなたは広報部のライターである。新製品 SkyLine X1 の発表お知らせ文を"
            "日本語で書く。制約: 180字以内、キーワード「SkyLine X1」を必ず含める。"
            "本文のみを出力し、前置きや説明は書かない。"
            "指示に修正コメントが含まれる場合は必ず反映する。"
        ),
        callback_handler=None,
    )
    prompt = "新製品 SkyLine X1 の発表お知らせ文を書いてください。"
    if instruction.strip():
        prompt += f"\n修正コメント: {instruction.strip()}"
    draft = str(writer(prompt)).strip()
    _STATE.data["draft"] = draft
    _STATE.record("run_writer", instruction=instruction, draft_len=len(draft))
    return f"下書きを生成した ({len(draft)}字):\n{draft}"


@tool
def run_static_check() -> str:
    """現在の下書きに対する静的チェック (キーワード有無 + 字数) を実行する。"""
    draft = _STATE.data.get("draft", "")
    errors = []
    if KEYWORD not in draft:
        errors.append(f"キーワード '{KEYWORD}' が含まれていない")
    if len(draft) > MAX_CHARS:
        errors.append(f"字数超過 ({len(draft)}字 > {MAX_CHARS}字)")
    verdict = "OK" if not errors else "NG: " + "; ".join(errors)
    _STATE.record("run_static_check", verdict=verdict)
    return verdict


@tool
def run_checker() -> str:
    """checker エージェント (LLM) が現在の下書きを審査し OK/NG と理由を返す。"""
    draft = _STATE.data.get("draft", "")
    force_ng = int(os.getenv("CONFIGC_FORCE_CHECKER_NG", "0"))
    ng_used = _STATE.data.get("forced_ng_used", 0)
    if ng_used < force_ng:
        _STATE.data["forced_ng_used"] = ng_used + 1
        verdict = "NG: 発表日と問い合わせ先が記載されていない (実験用の強制NG)"
        _STATE.record("run_checker", verdict=verdict, forced=True)
        return verdict
    checker = Agent(
        model=make_model(),
        system_prompt=(
            "あなたは広報文の審査担当である。渡された新製品発表お知らせ文を審査し、"
            "1行目に OK または NG のみを書く。NG の場合は 2 行目に理由を書く。"
            "審査基準: 製品名 SkyLine X1 が含まれ、発表文として意味が通ること。"
            "基準を満たすなら OK とする。"
        ),
        callback_handler=None,
    )
    verdict = str(checker(f"以下を審査せよ:\n{draft}")).strip()
    _STATE.record("run_checker", verdict=verdict, forced=False)
    return verdict


@tool
def request_human_review() -> str:
    """現在の下書きについて非同期の人間確認を要求する。承認されるまでワークフローは中断される。"""
    # 応答は HumanReviewHook の interrupt 経由で注入される
    if not _PENDING_HUMAN:
        _STATE.record("request_human_review", verdict="ERROR: no decision")
        return "ERROR: 人間の判断が得られなかった"
    decision = _PENDING_HUMAN.pop()
    if decision.lower().startswith("ok"):
        result = "APPROVED: 人間レビューで承認された。finalizer に進んでよい。"
    else:
        comment = decision.split(":", 1)[1].strip() if ":" in decision else decision
        result = f"REJECTED: 人間レビューで差戻しされた。コメント: {comment}"
    _STATE.record("request_human_review", verdict=result)
    return result


@tool
def run_finalizer() -> str:
    """finalizer を実行し、現在の下書きに定型フッターを付与して最終成果物を確定する。"""
    final = _STATE.data.get("draft", "") + FOOTER
    _STATE.data["final"] = final
    (_RUN_DIR / "final.txt").write_text(final, encoding="utf-8")
    _STATE.record("run_finalizer", final_len=len(final))
    return f"最終成果物を確定した:\n{final}"


@tool
def escalate(reason: str) -> str:
    """差戻し上限超過時に人間の担当者へエスカレーションしてワークフローを終了する。"""
    (_RUN_DIR / "escalation.txt").write_text(reason, encoding="utf-8")
    _STATE.record("escalate", reason=reason)
    return "エスカレーションを記録した。ワークフローを終了せよ。"


# ---------------------------------------------------------------------------
# interrupt hook (request_human_review 実行前にオーケストレータ全体を停止)
# ---------------------------------------------------------------------------


class HumanReviewHook(HookProvider):
    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(BeforeToolCallEvent, self.on_tool)

    def on_tool(self, event: BeforeToolCallEvent) -> None:
        if event.tool_use["name"] != "request_human_review":
            return
        decision = event.interrupt(
            "human_review",
            reason={
                "question": "この下書きを承認しますか? (ok / ng: コメント)",
                "draft": _STATE.data.get("draft", ""),
            },
        )
        _PENDING_HUMAN.append(str(decision))


# ---------------------------------------------------------------------------
# オーケストレータ Agent
# ---------------------------------------------------------------------------

ORCHESTRATOR_SYSTEM_PROMPT = """\
あなたは新製品発表お知らせ文作成ワークフローのオーケストレータである。
以下のワークフロー定義・役割定義に厳密に従い、ツールを正しい順序で呼び出せ。

# 役割定義
- writer: お知らせ文の下書きを生成する (ツール: run_writer)
- static_check: キーワードと字数の機械チェック (ツール: run_static_check)
- checker: LLM による内容審査、OK/NG と理由を返す (ツール: run_checker)
- human_review: 非同期の人間確認 (ツール: request_human_review)
- finalizer: 定型フッターを付与して最終成果物を確定する (ツール: run_finalizer)
- escalation: 差戻し上限超過時の人間へのエスカレーション (ツール: escalate)

# ワークフロー定義 (この順序を厳守する)
1. run_writer を呼ぶ。差戻しコメントがある場合は instruction に必ず渡す。
2. run_static_check を呼ぶ。NG なら NG 理由を instruction にして手順1へ戻る。
3. run_checker を呼ぶ。NG なら NG 理由を instruction にして手順1へ戻る。
4. request_human_review を呼ぶ。
   - APPROVED なら手順5へ進む。
   - REJECTED ならレビューコメントを instruction にして手順1へ戻る。
5. run_finalizer を呼び、その結果を最終回答として報告し終了する。

# 差戻しルール
- 手順2・3・4 の NG/REJECTED による手順1へのやり直し (差戻し) は合計 3 回まで。
- 4 回目の差戻しが必要になったら run_writer を呼ばず、escalate を呼んで終了する。

# 禁止事項
- ステップを飛ばさない。順序を入れ替えない。
- 同じツールを結果を見ずに連続で呼ばない。
- ツールの結果を自分で捏造しない。
"""


def build_orchestrator(session_id: str, sessions_dir: str, model_id: str) -> Agent:
    sm = FileSessionManager(session_id=session_id, storage_dir=sessions_dir)
    return Agent(
        model=make_model(model_id, max_tokens=1024),
        system_prompt=ORCHESTRATOR_SYSTEM_PROMPT,
        tools=[
            run_writer,
            run_static_check,
            run_checker,
            request_human_review,
            run_finalizer,
            escalate,
        ],
        hooks=[HumanReviewHook()],
        session_manager=sm,
        callback_handler=None,
    )
