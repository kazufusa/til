// Chat Agent: searchKnowledge ツールだけ持つ.
// CLI から呼ぶための関数を提供.

import { streamText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { runSearchAgent } from "./search-agent";
import { chatAgentSystemPrompt } from "./prompts";
import { resolveModel } from "./model";
import type { ModelMessage } from "ai";

export type ChatOptions = {
  chatModelSpec?: string;
  searchModelSpec?: string;
};

export function streamChat(messages: ModelMessage[], options?: ChatOptions) {
  const searchSpec = options?.searchModelSpec ?? options?.chatModelSpec;
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
