// ============================================================================
// chat-agent.ts — ユーザーと対話するチャットエージェント.
//
// 設計思想:
// - Chat Agent は **searchKnowledge ツール 1 つだけ** を持つ.
//   低レベル (listDocuments / grepBlocks / readBlocks) は意図的に隠す.
// - 内部の Search Agent と「探索」と「回答」の役割を分離する 2 段構成.
//   Chat Agent は evidence を読んで回答する責務、Search Agent は evidence を集める責務.
//
// なぜ 2 段にするか:
// - Chat Agent に大量のツールを持たせると、ループが長くなり context を浪費する.
// - 探索戦略 (grep → read) は Search Agent の system prompt で集中して指示すれば良い.
// - Chat Agent は出力品質 (出典付き、推測しない) に集中できる.
//
// モデル切り替え:
// - --chat-model / --search-model を分けて指定できる (CLI 側).
// - 既定では Chat と Search に同じモデルを使う (chatModelSpec を search にもフォールバック).
// ============================================================================

import { streamText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { runSearchAgent } from "./search-agent";
import { chatAgentSystemPrompt } from "./prompts";
import { resolveModel } from "./model";
import type { ModelMessage } from "ai";

/**
 * Chat の起動オプション.
 * - chatModelSpec   : Chat Agent 用 LLM (例: "vertex:gemini-3.1-flash-lite-preview")
 * - searchModelSpec : Search Agent 用 LLM. 未指定なら chatModelSpec を流用.
 */
export type ChatOptions = {
  chatModelSpec?: string;
  searchModelSpec?: string;
};

/**
 * 会話履歴を渡してストリーミングのチャットを開始する.
 * 返り値の `fullStream` を for-await で読むと、テキスト / tool-call / tool-result / error が逐次取れる.
 *
 * ツール:
 * - searchKnowledge: 内部で Search Agent を起動して evidence を返す
 *
 * 制御:
 * - stopWhen: stepCountIs(6) でループを止める. 通常は 1 step (searchKnowledge 1 回 + 回答) で完結するが、
 *   フォローアップで再検索したくなる場合の余地を持たせている.
 * - temperature: 0.3. 出典付き回答を安定させるため低め.
 */
export function streamChat(messages: ModelMessage[], options?: ChatOptions) {
  // Search Agent 用モデル. 未指定なら chat と同じものを使う.
  const searchSpec = options?.searchModelSpec ?? options?.chatModelSpec;

  // Chat Agent に渡す唯一のツール.
  // execute で Search Agent を呼んで、その戻り値 (evidence JSON) を LLM に渡している.
  const searchKnowledgeTool = tool({
    description:
      "ローカル文書群から質問に関係する原文確認済みの根拠を探します。Search Agent を内部で起動し、evidence JSON を返します。",
    inputSchema: z.object({
      question: z.string().min(1),
      preferredDocType: z.array(z.string()).optional(),
    }),
    execute: async ({ question, preferredDocType }) => {
      return await runSearchAgent(
        { question, preferredDocType },
        { modelSpec: searchSpec }
      );
    },
  });

  return streamText({
    model: resolveModel(options?.chatModelSpec),
    system: chatAgentSystemPrompt,
    messages,
    tools: { searchKnowledge: searchKnowledgeTool },
    stopWhen: stepCountIs(6),
    temperature: 0.3,
  });
}
