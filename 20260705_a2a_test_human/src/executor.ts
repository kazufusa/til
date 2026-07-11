import { randomUUID } from "node:crypto";
import type { Message } from "@a2a-js/sdk";
import type {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext,
} from "@a2a-js/sdk/server";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, type ModelMessage } from "ai";
import { LLM_BASE_URL, LLM_MODEL } from "./config";

const llm = createOpenAICompatible({
  name: "llama-cpp",
  baseURL: LLM_BASE_URL,
});

const SYSTEM_PROMPT =
  "You are a helpful assistant. Reply in the same language as the user. /no_think";

function textOf(message: Message): string {
  return message.parts
    .filter((p) => p.kind === "text")
    .map((p) => p.text)
    .join("\n");
}

// Qwen3 の思考ブロックを除去する
function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export class LlmChatExecutor implements AgentExecutor {
  // contextId ごとの会話履歴。A2A の contextId が会話継続の単位になる
  private histories = new Map<string, ModelMessage[]>();

  execute = async (
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> => {
    const { userMessage, contextId } = requestContext;

    const history = this.histories.get(contextId) ?? [];
    history.push({ role: "user", content: textOf(userMessage) });

    try {
      const { text } = await generateText({
        model: llm(LLM_MODEL),
        instructions: SYSTEM_PROMPT,
        messages: history,
      });
      const reply = stripThink(text);

      history.push({ role: "assistant", content: reply });
      this.histories.set(contextId, history);

      const responseMessage: Message = {
        kind: "message",
        messageId: randomUUID(),
        role: "agent",
        parts: [{ kind: "text", text: reply }],
        contextId,
      };
      eventBus.publish(responseMessage);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      eventBus.publish({
        kind: "message",
        messageId: randomUUID(),
        role: "agent",
        parts: [{ kind: "text", text: `LLM呼び出しに失敗しました: ${detail}` }],
        contextId,
      });
    } finally {
      eventBus.finished();
    }
  };

  cancelTask = async (
    _taskId: string,
    _eventBus: ExecutionEventBus,
  ): Promise<void> => {
    // 応答は Message で即時完結するため、キャンセル対象の長寿命タスクは存在しない
  };
}
