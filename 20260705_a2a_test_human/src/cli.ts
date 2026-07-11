import { randomUUID } from "node:crypto";
import readline from "node:readline";
import { stdin, stdout } from "node:process";
import type { Message, Task } from "@a2a-js/sdk";
import {
  ClientFactory,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
} from "@a2a-js/sdk/client";
import { A2A_BASE_URL } from "./config";
import { createDebugFetch } from "./debug-fetch";
import { loadSessions, upsertSession } from "./session";

let debugEnabled = !process.argv.includes("--quiet");
const debugFetch = createDebugFetch(() => debugEnabled);

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function extractText(result: Message | Task): string {
  if (result.kind === "message") {
    return result.parts
      .filter((p) => p.kind === "text")
      .map((p) => p.text)
      .join("\n");
  }
  // Task の場合は status message か最後の artifact からテキストを拾う
  const statusText = result.status.message?.parts
    .filter((p) => p.kind === "text")
    .map((p) => p.text)
    .join("\n");
  if (statusText) return statusText;
  const artifactText = result.artifacts
    ?.flatMap((a) => a.parts)
    .filter((p) => p.kind === "text")
    .map((p) => p.text)
    .join("\n");
  return artifactText ?? `(task ${result.id}: ${result.status.state})`;
}

// question() は応答待ち中に stdin が EOF になると次回呼び出しで例外になるため、
// パイプ入力でも安全な async イテレータを一本だけ作って全入力をここから読む
const rl = readline.createInterface({ input: stdin, output: stdout });
const lines = rl[Symbol.asyncIterator]();

async function ask(promptText: string): Promise<string | null> {
  stdout.write(promptText);
  const { value, done } = await lines.next();
  return done ? null : value.trim();
}

// 起動時に過去の会話履歴から再開する会話を選ぶ
async function chooseSession(): Promise<string | undefined> {
  if (process.argv.includes("--new")) return undefined;
  const sessions = loadSessions(A2A_BASE_URL);
  if (sessions.length === 0) return undefined;

  console.log(bold("会話履歴:"));
  sessions.forEach((s, i) => {
    const when = s.updatedAt.replace("T", " ").slice(0, 16);
    console.log(`  ${i + 1}) ${s.title} ${dim(`(${when})`)}`);
  });
  console.log(`  0) 新しい会話`);

  const answer = await ask(bold("再開する会話を選択 (Enter=1): "));
  if (answer === null) return undefined;
  const n = answer === "" ? 1 : Number(answer);
  if (Number.isInteger(n) && n >= 1 && n <= sessions.length) {
    const chosen = sessions[n - 1]!;
    console.log(dim(`「${chosen.title}」を再開します (contextId: ${chosen.contextId})\n`));
    return chosen.contextId;
  }
  console.log(dim("新しい会話を始めます\n"));
  return undefined;
}

const factory = new ClientFactory({
  transports: [new JsonRpcTransportFactory({ fetchImpl: debugFetch })],
  cardResolver: new DefaultAgentCardResolver({ fetchImpl: debugFetch }),
});

console.log(dim(`connecting to ${A2A_BASE_URL} ...`));
const client = await factory.createFromUrl(A2A_BASE_URL);
const card = await client.getAgentCard();

console.log(`\n${bold(card.name)} — ${card.description}`);
console.log(
  dim("コマンド: /new 会話リセット | /debug デバッグ切替 | /exit 終了\n"),
);

let contextId = await chooseSession();
let firstMessage: string | undefined;

for (;;) {
  const line = await ask(bold("you> "));
  if (line === null || line === "/exit" || line === "/quit") break;
  if (!line) continue;

  if (line === "/new") {
    contextId = undefined;
    firstMessage = undefined;
    console.log(dim("会話をリセットしました (次の送信で新しい contextId が発行されます)\n"));
    continue;
  }
  if (line === "/debug") {
    debugEnabled = !debugEnabled;
    console.log(dim(`HTTPデバッグ出力: ${debugEnabled ? "on" : "off"}\n`));
    continue;
  }

  const message: Message = {
    kind: "message",
    messageId: randomUUID(),
    role: "user",
    parts: [{ kind: "text", text: line }],
    ...(contextId ? { contextId } : {}),
  };

  try {
    const result = await client.sendMessage({
      message,
      configuration: { blocking: true, acceptedOutputModes: ["text/plain"] },
    });

    contextId = result.contextId ?? contextId;
    firstMessage ??= line;
    if (contextId) upsertSession(A2A_BASE_URL, contextId, firstMessage);
    console.log(`\n${green("agent>")} ${extractText(result)}`);
    console.log(dim(`(contextId: ${contextId})\n`));
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`\nエラー: ${detail}\n`);
  }
}

rl.close();
console.log(dim("bye"));
