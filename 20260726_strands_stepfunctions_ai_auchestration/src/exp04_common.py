"""exp04 共通: Graph (writer -> publisher) + BeforeNodeCallEvent interrupt.

publisher ノード実行前に human gate interrupt を発生させる。
Graph 側の session_manager (GraphBuilder.set_session_manager) で
graph の interrupt 状態・実行状態を永続化する
(strands/multiagent/graph.py serialize_state/deserialize_state, strands-agents 1.48.0).

注意: Graph のノード agent 自身に session_manager は付けられない
("Session persistence is not supported for Graph agents yet."
 strands/multiagent/graph.py _validate_node_executor).
"""

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common.llm import make_model

from strands import Agent
from strands.hooks import HookProvider, HookRegistry
from strands.hooks.events import BeforeNodeCallEvent
from strands.multiagent.graph import Graph, GraphBuilder
from strands.session.file_session_manager import FileSessionManager


class PublisherGateHook(HookProvider):
    """publisher ノードの実行前に人間の OK/NG を求める interrupt を発生させる."""

    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(BeforeNodeCallEvent, self.gate)

    def gate(self, event: BeforeNodeCallEvent) -> None:
        if event.node_id != "publisher":
            return
        decision = event.interrupt(
            "publisher_gate",
            reason={"question": "publish the draft?", "node_id": event.node_id},
        )
        if decision != "OK":
            event.cancel_node = f"human rejected publishing: {decision}"


def build_graph(session_id: str, sessions_dir: str) -> Graph:
    writer = Agent(
        name="writer",
        model=make_model(),
        system_prompt="Write a one-sentence draft announcement for the given topic.",
        callback_handler=None,
    )
    publisher = Agent(
        name="publisher",
        model=make_model(),
        system_prompt="Output the final announcement prefixed with 'PUBLISHED:'.",
        callback_handler=None,
    )

    sm = FileSessionManager(session_id=session_id, storage_dir=sessions_dir)
    builder = GraphBuilder()
    builder.add_node(writer, "writer")
    builder.add_node(publisher, "publisher")
    builder.add_edge("writer", "publisher")
    builder.set_entry_point("writer")
    builder.set_session_manager(sm)
    builder.set_hook_providers([PublisherGateHook()])
    return builder.build()
