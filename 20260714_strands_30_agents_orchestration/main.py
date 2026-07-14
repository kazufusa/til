"""実ビジネス組織をモデルにした 30 functional role の Swarm オーケストレーション。

組織はリクエストを受けると intake_coordinator が内容を解釈し、
必要な職能へ handoff する。各エージェントは自職能の成果物を作り、
別職能の作業が必要なら更に handoff、揃ったら最後のエージェントが回答して完了。

実行後、runs/<日時>/ に「どうオーケストレーションされたか」のレポートを残す。
  - report.md    handoff の流れ (mermaid) + 各職能の発話タイムライン
  - events.jsonl 生イベント (機械可読)

モデルは ollama 経由のローカルLLM。
  - 入口 (intake): ORCH_MODEL (既定 qwen3:8b)
  - 各職能:        SUB_MODEL  (既定 qwen3:4b-instruct)
"""

import argparse
import datetime
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from strands import Agent
from strands.hooks import BeforeToolCallEvent, HookProvider, HookRegistry
from strands.models.ollama import OllamaModel
from strands.multiagent import Swarm

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
# qwen3:8b を intake に試したが、CPU実行では1ターンが node_timeout (900s) に
# 収まらなかったため、この環境の既定は検証済みの 4B とする (README 参照)
ORCH_MODEL = os.environ.get("ORCH_MODEL", "qwen3:4b-instruct")
SUB_MODEL = os.environ.get("SUB_MODEL", "qwen3:4b-instruct")

# (name, 職能ミッション)
# description は Swarm が handoff 先選択の根拠として各エージェントに提示する
ROLES: list[tuple[str, str]] = [
    ("intake_coordinator", "受付・トリアージ。依頼を解釈し、最初に動くべき職能を判断して引き渡す"),
    # 商流
    ("sales", "新規顧客への提案、見積もり、商談推進"),
    ("account_management", "既存顧客との関係維持、契約更新、アップセル"),
    ("customer_success", "顧客のオンボーディングと活用支援、解約防止"),
    ("customer_support", "問い合わせ対応、障害受付、FAQ整備"),
    # マーケティング
    ("marketing_strategy", "市場分析、ターゲット設定、施策の全体設計"),
    ("content_marketing", "ブログ・事例・ホワイトペーパー等のコンテンツ企画と制作"),
    ("seo_specialist", "検索流入の分析と改善、キーワード戦略"),
    ("pr_communications", "プレスリリース、広報、危機管理コミュニケーション"),
    ("brand_designer", "ロゴ・ビジュアルアイデンティティ・販促物のデザイン"),
    # プロダクト・開発
    ("product_management", "要求整理、優先順位付け、ロードマップ、仕様策定"),
    ("ux_research", "ユーザーインタビュー、ユーザビリティ調査、課題発見"),
    ("ui_design", "画面設計、ワイヤーフレーム、デザインシステム"),
    ("backend_engineering", "API・ドメインロジック・データベースの設計と実装"),
    ("frontend_engineering", "Webフロントエンドの設計と実装"),
    ("mobile_engineering", "iOS/Androidアプリの設計と実装"),
    ("qa_engineering", "テスト計画、テストケース設計、品質保証"),
    ("devops_sre", "CI/CD、インフラ、監視、信頼性運用"),
    ("security_engineering", "脆弱性評価、セキュア設計、インシデント対応"),
    ("technical_writing", "技術文書、APIリファレンス、利用者向けマニュアル"),
    # データ
    ("data_analytics", "KPI設計、データ分析、レポーティング"),
    ("data_engineering", "データ基盤、ETL/ELTパイプライン"),
    ("machine_learning", "機械学習モデルの設計・学習・評価"),
    # コーポレート
    ("finance_accounting", "会計処理、請求、支払い、月次決算"),
    ("financial_planning", "予算策定、収支計画、投資判断の財務分析"),
    ("legal_counsel", "契約書レビュー、法的リスク評価、知的財産"),
    ("compliance_officer", "法令・規制遵守、個人情報保護、社内規程"),
    ("hr_recruiting", "採用計画、求人、面接プロセス設計"),
    ("procurement", "購買、ベンダー選定、価格交渉"),
    ("it_support", "社内IT、アカウント管理、機器・SaaS管理"),
]

SYSTEM_PROMPT = """あなたは企業組織の一員。職能: {name}。ミッション: {mission}。
自分の職能の範囲で、依頼に対する具体的な成果物を日本語で簡潔に作成すること。
他職能の作業が必要な場合のみ handoff する。成果物が揃ったら handoff せずに最終回答をまとめて終了する。"""

THINK_TAG_RE = re.compile(r"<think>.*?</think>\s*", flags=re.DOTALL)


def build_model(model_id: str) -> OllamaModel:
    return OllamaModel(
        host=OLLAMA_HOST,
        model_id=model_id,
        temperature=0.0,
        keep_alive="30m",
        # Swarm が注入する調整指示 + 30職能一覧 + handoff ツール定義が乗るため、
        # ollama 既定の num_ctx (4096) では溢れる
        options={"num_ctx": 16384},
    )


class BlockSelfHandoff(HookProvider):
    """自分自身への handoff をハーネス側で決定的に遮断する。

    4B級モデルは直前の handoff 文面を模倣して自分宛てに handoff することがあり、
    Swarm 側は自己 handoff を有効なノード遷移として受理してしまう (run3 で実測)。
    """

    def register_hooks(self, registry: HookRegistry, **kwargs) -> None:
        registry.add_callback(BeforeToolCallEvent, self._block)

    @staticmethod
    def _block(event: BeforeToolCallEvent) -> None:
        if (
            event.tool_use.get("name") == "handoff_to_agent"
            and event.tool_use.get("input", {}).get("agent_name") == event.agent.name
        ):
            event.cancel_tool = (
                "自分自身への handoff は無効。他職能の作業が不要なら handoff せず、"
                "自分の成果物を最終回答としてまとめて終了すること。"
            )


class RunRecorder:
    """各職能の発話と handoff を時刻付きで記録する。"""

    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []
        self.started_at = datetime.datetime.now()

    def record_message(self, agent: str, message: dict[str, Any]) -> None:
        if message.get("role") != "assistant":
            return
        texts: list[str] = []
        handoffs: list[dict[str, Any]] = []
        for block in message.get("content", []):
            if text := block.get("text"):
                texts.append(text)
            if (tool_use := block.get("toolUse")) and tool_use.get("name") == "handoff_to_agent":
                handoffs.append(tool_use.get("input", {}))
        text = THINK_TAG_RE.sub("", "\n".join(texts)).strip()
        if not text and not handoffs:
            return
        self.events.append(
            {
                "t": datetime.datetime.now().isoformat(timespec="seconds"),
                "elapsed_s": round((datetime.datetime.now() - self.started_at).total_seconds(), 1),
                "agent": agent,
                "text": text,
                "handoffs": handoffs,
            }
        )


def _mermaid_label(message: str, limit: int = 50) -> str:
    label = re.sub(r"\s+", " ", message).strip().replace('"', "'")
    return label[:limit] + ("…" if len(label) > limit else "")


def write_report(recorder: RunRecorder, request: str, result: Any, models: dict[str, str]) -> Path:
    out_dir = Path("runs") / recorder.started_at.strftime("%Y%m%d_%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)

    with (out_dir / "events.jsonl").open("w") as f:
        for event in recorder.events:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")

    trail = [node.node_id for node in result.node_history]
    usage = result.accumulated_usage

    lines: list[str] = []
    lines.append("# 実行レポート")
    lines.append("")
    lines.append(f"リクエスト: {request}")
    lines.append("")
    lines.append(f"- 日時: {recorder.started_at.isoformat(timespec='seconds')}")
    lines.append(f"- status: {result.status}")
    lines.append(f"- 所要時間: {result.execution_time / 1000:.1f}s / iterations: {result.execution_count}")
    lines.append(
        f"- tokens: in={usage['inputTokens']} out={usage['outputTokens']} total={usage['totalTokens']}"
    )
    lines.append(f"- モデル: intake={models['orch']} / roles={models['sub']}")
    lines.append(f"- 稼働した職能: {' -> '.join(trail)}")
    lines.append("")

    lines.append("## オーケストレーションの流れ")
    lines.append("")
    lines.append("実線は実際に起きた遷移、破線は handoff 要求のみ(同一ターン内で後続の handoff に上書き、または自己 handoff として遮断)。")
    lines.append("")
    lines.append("```mermaid")
    lines.append("flowchart TD")
    lines.append('    request(["リクエスト"]) --> intake_coordinator')
    pending = list(zip(trail, trail[1:]))  # 実際に起きた遷移(時系列)
    step = 0
    for event in recorder.events:
        for handoff in event["handoffs"]:
            step += 1
            target = handoff.get("agent_name", "?")
            label = _mermaid_label(handoff.get("message", ""))
            if pending and pending[0] == (event["agent"], target):
                pending.pop(0)
                arrow = "-->"
            else:
                arrow = "-.->"
            lines.append(f'    {event["agent"]} {arrow}|"{step}. {label}"| {target}')
    if trail:
        lines.append(f'    {trail[-1]} --> answer(["最終アウトプット"])')
    lines.append("```")
    lines.append("")

    lines.append("## タイムライン")
    lines.append("")
    for i, event in enumerate(recorder.events, 1):
        lines.append(f"### {i}. {event['agent']} (+{event['elapsed_s']}s)")
        lines.append("")
        if event["text"]:
            lines.append(event["text"])
            lines.append("")
        for handoff in event["handoffs"]:
            lines.append(f"handoff -> {handoff.get('agent_name', '?')}")
            lines.append("")
            if message := handoff.get("message"):
                lines.append(f"> {message}")
                lines.append("")
            if context := handoff.get("context"):
                lines.append(f"> context: {json.dumps(context, ensure_ascii=False)}")
                lines.append("")

    report_path = out_dir / "report.md"
    report_path.write_text("\n".join(lines))
    return report_path


_speaking: str | None = None


def make_printer(name: str, recorder: RunRecorder):
    """実行ログの可視化 (どの職能が発話中か・ツール呼び出し) と記録を兼ねる。"""
    seen_tool_ids: set[str] = set()

    def printer(**kwargs):
        global _speaking
        if data := kwargs.get("data"):
            if _speaking != name:
                print(f"\n\n───── {name} ─────", flush=True)
                _speaking = name
            print(data, end="", flush=True)
        elif tool_use := kwargs.get("current_tool_use"):
            tool_id = tool_use.get("toolUseId")
            if tool_id and tool_id not in seen_tool_ids:
                seen_tool_ids.add(tool_id)
                print(f"\n\n───── {name} → tool: {tool_use.get('name')} ─────", flush=True)
                _speaking = None
        elif message := kwargs.get("message"):
            recorder.record_message(name, message)

    return printer


def build_swarm(recorder: RunRecorder) -> Swarm:
    orch_model = build_model(ORCH_MODEL)
    sub_model = build_model(SUB_MODEL)
    agents = []
    for name, mission in ROLES:
        is_intake = name == "intake_coordinator"
        model = orch_model if is_intake else sub_model
        prompt = SYSTEM_PROMPT.format(name=name, mission=mission)
        # qwen3 の thinking ハイブリッド系 (instruct タグなし) は /no_think を明示する
        if "instruct" not in (ORCH_MODEL if is_intake else SUB_MODEL):
            prompt = "/no_think\n" + prompt
        agents.append(
            Agent(
                model=model,
                name=name,
                description=mission,
                system_prompt=prompt,
                callback_handler=make_printer(name, recorder),
                hooks=[BlockSelfHandoff()],
            )
        )
    return Swarm(
        agents,
        entry_point=agents[0],
        max_handoffs=8,
        max_iterations=8,
        execution_timeout=3600.0,
        node_timeout=900.0,
        repetitive_handoff_detection_window=6,
        repetitive_handoff_min_unique_agents=3,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="30 functional role の組織にリクエストを投げる")
    parser.add_argument("request", help="組織への依頼内容")
    args = parser.parse_args()

    recorder = RunRecorder()
    swarm = build_swarm(recorder)
    print(f"組織 (30 roles) にリクエストを受付: {args.request}")
    print(f"intake={ORCH_MODEL} / roles={SUB_MODEL} @ {OLLAMA_HOST}")

    result = swarm(args.request)

    print("\n\n===== 実行サマリ =====")
    print(f"status: {result.status}")
    trail = [node.node_id for node in result.node_history]
    print(f"handoff trail: {' -> '.join(trail) or '(なし)'}")
    print(f"iterations: {result.execution_count}, time: {result.execution_time / 1000:.1f}s")
    usage = result.accumulated_usage
    print(
        f"tokens: in={usage['inputTokens']} out={usage['outputTokens']} total={usage['totalTokens']}"
    )

    if trail and trail[-1] in result.results:
        last_node = trail[-1]
        print(f"\n===== 最終アウトプット ({last_node}) =====")
        print(THINK_TAG_RE.sub("", str(result.results[last_node].result)).strip())

    report_path = write_report(
        recorder, args.request, result, {"orch": ORCH_MODEL, "sub": SUB_MODEL}
    )
    print(f"\nレポート: {report_path}")
    return 0 if str(result.status) == "Status.COMPLETED" else 1


if __name__ == "__main__":
    sys.exit(main())
