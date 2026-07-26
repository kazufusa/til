"""exp03 共通: 承認が必要なツール + interrupt を発生させる hook + agent factory.

SDK の interrupt 仕様 (strands/types/interrupt.py docstring, strands-agents 1.48.0):
- hook (BeforeToolCallEvent など) で event.interrupt(name, reason) を呼ぶと
  InterruptException が上がり event loop が停止、AgentResult.stop_reason == "interrupt"
- interrupt 状態は session manager 経由で永続化される
- agent([{"interruptResponse": {"interruptId": ..., "response": ...}}]) で再開
"""

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.llm import make_model

from strands import Agent, tool
from strands.hooks import BeforeToolCallEvent, HookProvider, HookRegistry
from strands.session.file_session_manager import FileSessionManager

APPLIED_MARKER = Path(__file__).resolve().parent.parent / ".exp03_applied.txt"


@tool
def apply_change(change_id: str) -> str:
    """Apply the change identified by change_id to the production system."""
    APPLIED_MARKER.write_text(f"applied: {change_id}\n")
    return f"change {change_id} applied to production"


class HumanApprovalHook(HookProvider):
    """apply_change の実行前に human approval interrupt を発生させる."""

    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(BeforeToolCallEvent, self.approve)

    def approve(self, event: BeforeToolCallEvent) -> None:
        if event.tool_use["name"] != "apply_change":
            return
        decision = event.interrupt(
            "human_approval",
            reason={"question": "approve apply_change?", "tool_input": event.tool_use["input"]},
        )
        if decision != "OK":
            event.cancel_tool = f"human rejected the change: {decision}"


def build_agent(session_id: str, sessions_dir: str) -> Agent:
    sm = FileSessionManager(session_id=session_id, storage_dir=sessions_dir)
    return Agent(
        model=make_model(),
        tools=[apply_change],
        hooks=[HumanApprovalHook()],
        session_manager=sm,
        system_prompt=(
            "You apply changes with the apply_change tool. "
            "Call apply_change at most once per request. "
            "Once you receive any tool result (success or error), do NOT call the tool again; "
            "just summarize the outcome in one sentence."
        ),
        callback_handler=None,
    )
