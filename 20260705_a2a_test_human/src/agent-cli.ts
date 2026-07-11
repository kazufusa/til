// 人間 → オーケストレータLLM → A2Aサーバー の2ホップ構成クライアント。
// 人間はLLMに自然言語で依頼し、LLMがツール経由でリモートA2Aエージェントと会話する。
// リモート側の contextId (どの会話か) は人間の指示で切替・リセット・復帰できる。
// 意図の解釈だけをLLMに任せ、contextId の解決は台帳 (.a2a-sessions.json) で決定的に行う。

import { randomUUID } from "node:crypto";
import readline from "node:readline";
import { stdin, stdout } from "node:process";
import type { Message, Task } from "@a2a-js/sdk";
import {
  ClientFactory,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
} from "@a2a-js/sdk/client";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { A2A_BASE_URL, LLM_BASE_URL, LLM_MODEL } from "./config";
import { createDebugFetch } from "./debug-fetch";
import { loadSessions, upsertSession, type SessionEntry } from "./session";

let debugEnabled = !process.argv.includes("--quiet");
const debugFetch = createDebugFetch(() => debugEnabled);

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const llm = createOpenAICompatible({
  name: "llama-cpp",
  baseURL: LLM_BASE_URL,
});

function extractText(result: Message | Task): string {
  if (result.kind === "message") {
    return result.parts
      .filter((p) => p.kind === "text")
      .map((p) => p.text)
      .join("\n");
  }
  const statusText = result.status.message?.parts
    .filter((p) => p.kind === "text")
    .map((p) => p.text)
    .join("\n");
  return statusText ?? `(task ${result.id}: ${result.status.state})`;
}

const factory = new ClientFactory({
  transports: [new JsonRpcTransportFactory({ fetchImpl: debugFetch })],
  cardResolver: new DefaultAgentCardResolver({ fetchImpl: debugFetch }),
});

console.log(dim(`connecting to ${A2A_BASE_URL} ...`));
const client = await factory.createFromUrl(A2A_BASE_URL);
const card = await client.getAgentCard();

// リモートA2Aエージェントとの「いまの会話」。人間の指示 (ツール経由) で切り替わる
let activeContextId: string | undefined;
// list_conversations が最後に見せた番号 → contextId の対応。切替はこの番号で行う
let lastListing: SessionEntry[] = [];

const tools = {
  ask_remote_agent: tool({
    description: `リモートエージェント「${card.name}」にメッセージを送り、返答を得る。現在アクティブな会話の続きとして送られる。`,
    inputSchema: z.object({
      message: z.string().describe("エージェントに送るメッセージ"),
    }),
    execute: async ({ message }) => {
      console.log(yellow(`  [tool] ask_remote_agent: ${message}`));
      const result = await client.sendMessage({
        message: {
          kind: "message",
          messageId: randomUUID(),
          role: "user",
          parts: [{ kind: "text", text: message }],
          ...(activeContextId ? { contextId: activeContextId } : {}),
        },
        configuration: { blocking: true, acceptedOutputModes: ["text/plain"] },
      });
      activeContextId = result.contextId ?? activeContextId;
      if (activeContextId) upsertSession(A2A_BASE_URL, activeContextId, message);
      const reply = extractText(result);
      console.log(yellow(`  [tool] remote agent: ${reply}`));
      return { reply, contextId: activeContextId };
    },
  }),

  list_conversations: tool({
    description:
      "リモートエージェントとの過去の会話一覧を返す。切替先を探すときに使う。",
    inputSchema: z.object({}),
    execute: async () => {
      lastListing = loadSessions(A2A_BASE_URL);
      console.log(yellow(`  [tool] list_conversations: ${lastListing.length}件`));
      return lastListing.map((s, i) => ({
        number: i + 1,
        title: s.title,
        updatedAt: s.updatedAt,
        active: s.contextId === activeContextId,
      }));
    },
  }),

  switch_conversation: tool({
    description:
      "指定した番号の過去の会話に切り替える。番号は list_conversations の結果のもの。",
    inputSchema: z.object({
      number: z.number().int().describe("list_conversations が返した番号"),
    }),
    execute: async ({ number }) => {
      if (lastListing.length === 0) lastListing = loadSessions(A2A_BASE_URL);
      const chosen = lastListing[number - 1];
      if (!chosen) {
        return { error: `番号 ${number} の会話はありません (1〜${lastListing.length})` };
      }
      activeContextId = chosen.contextId;
      console.log(yellow(`  [tool] switch_conversation: 「${chosen.title}」(${chosen.contextId})`));
      return { switched: chosen.title, contextId: chosen.contextId };
    },
  }),

  new_conversation: tool({
    description:
      "リモートエージェントとの会話をリセットし、次の送信から新しい会話を始める。",
    inputSchema: z.object({}),
    execute: async () => {
      activeContextId = undefined;
      console.log(yellow("  [tool] new_conversation: リセットしました"));
      return { reset: true };
    },
  }),
};

const SYSTEM_PROMPT = `あなたはリモートエージェント「${card.name}」への窓口となるオーケストレータ。
人間の依頼に応じてツールでリモートエージェントと会話する。会話の切替・リセット・復帰を指示されたら対応するツールを使う。
エージェントへの送信・質問は必ず ask_remote_agent ツールで行う。返答を自分で作ってはいけない。
リモートエージェントの返答は要約せずそのまま人間に伝える。日本語で簡潔に。`;

console.log(`\n${bold("Orchestrator")} — LLM(${LLM_MODEL}) 経由で ${card.name} と会話します`);
console.log(dim("例: 「エージェントに◯◯と聞いて」「新しい会話にして」「会話一覧見せて」「2番の会話に戻して」"));
console.log(dim("コマンド: /debug デバッグ切替 | /exit 終了\n"));

const history: ModelMessage[] = [];
const rl = readline.createInterface({ input: stdin, output: stdout });
const lines = rl[Symbol.asyncIterator]();

async function ask(promptText: string): Promise<string | null> {
  stdout.write(promptText);
  const { value, done } = await lines.next();
  return done ? null : value.trim();
}

for (;;) {
  const line = await ask(bold("you> "));
  if (line === null || line === "/exit" || line === "/quit") break;
  if (!line) continue;
  if (line === "/debug") {
    debugEnabled = !debugEnabled;
    console.log(dim(`HTTPデバッグ出力: ${debugEnabled ? "on" : "off"}\n`));
    continue;
  }

  history.push({ role: "user", content: line });

  try {
    const result = await generateText({
      model: llm(LLM_MODEL),
      instructions: SYSTEM_PROMPT,
      messages: history,
      tools,
      stopWhen: stepCountIs(6),
      // ツール呼び出しの取りこぼし (送ったふりの捏造) を減らすため決定的に
      temperature: 0,
    });
    history.push(...result.response.messages);

    console.log(`\n${green("llm>")} ${result.text.trim()}`);
    console.log(dim(`(remote contextId: ${activeContextId ?? "(なし: 次の送信で新規)"})\n`));
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`\nエラー: ${detail}\n`);
  }
}

rl.close();
console.log(dim("bye"));
