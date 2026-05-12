// ============================================================================
// chat.ts — 対話 CLI のエントリポイント.
//
// ユーザー入力ループで Chat Agent (streamChat) を呼び続ける.
// 標準入力から 1 行ずつ読み、回答を stream して表示.
// [tool: ...] / [tool-result: ...] 行で内部のツール呼び出しも可視化する.
//
// 設計上の工夫:
// - エラーは大スタックトレースを抑えて、formatError で一行に整形する.
// - ConnectionRefused / "does not support tools" 等の頻出エラーには
//   親切なヒント文を出す (Ollama 起動忘れ、tool 非対応モデル、等).
// - エラー時はユーザー入力を履歴から巻き戻す (汚染した履歴で次ターンが詰むのを避ける).
//
// usage:
//   bun run chat                                          # 既定: vertex:gemini-3.1-flash-lite-preview
//   bun run chat -- --model vertex:gemini-3.1-flash      # Chat + Search 両方を切り替え
//   bun run chat -- --model ollama:gemma3:4b             # ローカル Ollama (要 ollama serve)
//   bun run chat -- --chat-model vertex:gemini-3.1-pro --search-model ollama:gemma3:12b
// ============================================================================

import { streamChat, type ChatOptions } from "../knowledge/chat-agent";
import { closeDb } from "../knowledge/db";
import { describeSpec, DEFAULT_MODEL_SPEC } from "../knowledge/model";
import type { ModelMessage } from "ai";

/**
 * 簡易引数パーサ. yargs/commander は使わず手書きで済ませている.
 * --model は chat/search 両方を上書き、--chat-model / --search-model は個別.
 */
function parseArgs(argv: string[]): ChatOptions & { help?: boolean } {
  const opts: ChatOptions & { help?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "--model" || a === "-m") {
      const v = next();
      opts.chatModelSpec = v;
      opts.searchModelSpec = v;
    } else if (a === "--chat-model") opts.chatModelSpec = next();
    else if (a === "--search-model") opts.searchModelSpec = next();
  }
  return opts;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(`cdcs chat
options:
  --model <spec>          chat/search 共通のモデル
  --chat-model <spec>     chat agent モデル (上書き)
  --search-model <spec>   search agent モデル (上書き)

spec 書式: <provider>:<modelId>
  vertex:gemini-3.1-flash-lite-preview   (default)
  vertex:gemini-3.1-flash
  gemini:gemini-3.1-flash-lite-preview   (GOOGLE_GENERATIVE_AI_API_KEY)
  ollama:gemma3:4b                        (要 ollama serve)
  ollama:qwen2.5-coder:14b
`);
  process.exit(0);
}

const messages: ModelMessage[] = [];

/**
 * Vercel AI SDK 由来のエラーを 1 行に整形する.
 * cause / responseBody まで見て、Ollama の "does not support tools" 等の頻出エラーは
 * 候補モデルを併記して親切にする.
 */
function formatError(e: unknown): string {
  if (!e) return "unknown error";
  const err = e as {
    name?: string;
    message?: string;
    url?: string;
    statusCode?: number;
    responseBody?: string;
    cause?: { url?: string; code?: string; statusCode?: number; responseBody?: string };
    code?: string;
  };
  const cause = err.cause;
  const url = err.url ?? cause?.url;
  const code = err.code ?? cause?.code;
  const status = err.statusCode ?? cause?.statusCode;
  const body = err.responseBody ?? cause?.responseBody;
  if (code === "ConnectionRefused" || /Unable to connect/.test(err.message ?? "")) {
    return `Connection refused${url ? ` (${url})` : ""}. プロバイダが起動していますか? Ollama なら 'ollama serve' を別ターミナルで実行。`;
  }
  if (body) {
    let detail = body.slice(0, 300);
    try {
      const j = JSON.parse(body);
      if (j && typeof j === "object" && typeof (j as { error?: unknown }).error === "string") {
        detail = (j as { error: string }).error;
      }
    } catch {
      /* ignore */
    }
    if (/does not support tools/.test(detail)) {
      return `${detail}\n  → このモデルは tool calling 非対応です。ツール対応モデル (qwen3:4b, qwen2.5:7b, qwen2.5-coder:7b, llama3.2:3b, gpt-oss:20b 等) を試してください。`;
    }
    return `${status ? `HTTP ${status}: ` : ""}${detail}`;
  }
  if (err.message) return err.message.split("\n")[0]!.slice(0, 200);
  return String(e).slice(0, 200);
}

/**
 * 標準入力から 1 行読む (Bun の readline を使わずに最小実装).
 * Buffer に蓄積していって LF (0x0a) を見つけたらそこで切る.
 * stdin の pause/resume を毎回切り替えて、入力中だけ active にする.
 */
function read(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const onData = (b: Buffer) => {
      chunks.push(b);
      const buf = Buffer.concat(chunks);
      const nl = buf.indexOf(0x0a); // \n
      if (nl >= 0) {
        process.stdin.off("data", onData);
        process.stdin.pause();
        resolve(buf.slice(0, nl).toString("utf-8"));
      }
    };
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

/**
 * メインループ:
 *   read("you> ")             # ユーザー入力を 1 行待つ
 *   /exit /quit               # 終了
 *   /clear                    # 会話履歴クリア
 *   それ以外                  # streamChat(messages) → fullStream を表示
 */
async function main(): Promise<void> {
  console.log(
    `cdcs chat. /exit で終了。\n  chat-model:   ${describeSpec(args.chatModelSpec)}\n  search-model: ${describeSpec(args.searchModelSpec ?? args.chatModelSpec ?? DEFAULT_MODEL_SPEC)}`
  );
  while (true) {
    const user = (await read("\nyou> ")).trim();
    if (!user) continue;
    if (user === "/exit" || user === "/quit") break;
    if (user === "/clear") {
      messages.length = 0;
      console.log("(履歴クリア)");
      continue;
    }
    messages.push({ role: "user", content: user });
    process.stdout.write("\nassistant> ");

    let assistantText = "";
    try {
      const result = streamChat(messages, args);
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          process.stdout.write(part.text);
          assistantText += part.text;
        } else if (part.type === "tool-call") {
          process.stdout.write(
            `\n[tool: ${part.toolName}(${JSON.stringify(part.input).slice(0, 200)})]\n`
          );
        } else if (part.type === "tool-result") {
          const r = JSON.stringify(part.output);
          process.stdout.write(
            `[tool-result: ${r.slice(0, 200)}${r.length > 200 ? "..." : ""}]\n`
          );
        } else if (part.type === "error") {
          process.stdout.write(`\n[error: ${formatError(part.error)}]\n`);
        }
      }
    } catch (e) {
      process.stdout.write(`\n[error: ${formatError(e)}]\n`);
      // 履歴汚染を避ける: assistantText が無ければ user message を巻き戻す
      if (!assistantText) messages.pop();
    }
    process.stdout.write("\n");
    if (assistantText) {
      messages.push({ role: "assistant", content: assistantText });
    }
  }
  await closeDb();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
