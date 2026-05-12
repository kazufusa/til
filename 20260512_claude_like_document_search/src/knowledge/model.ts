// ============================================================================
// model.ts — LLM プロバイダ抽象化レイヤ.
//
// 設計選択:
// - CLI からは `--model <spec>` の 1 引数でモデルを切り替えたい.
// - spec の書式は `provider:modelId` のシンプル形式. provider 毎に独自の env を読む.
// - Vertex AI / Gemini Developer API / Ollama を同じインターフェイスで扱う.
//
// spec 例:
//   vertex:gemini-3.1-flash-lite-preview   ... Vertex AI (ADC、要 GOOGLE_VERTEX_*)
//   gemini:gemini-3.1-flash-lite-preview   ... Gemini Developer API (要 GOOGLE_GENERATIVE_AI_API_KEY)
//   ollama:gemma3:4b                       ... ローカル Ollama (要 ollama serve、tool calling 対応モデル限定)
//   ollama:qwen2.5-coder:14b
// ============================================================================

import { createVertex } from "@ai-sdk/google-vertex";
import { google } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider-v2";
import type { LanguageModel } from "ai";

/**
 * Vertex AI 用の固定インスタンス.
 * project / location はリポジトリにベタ書きしない方針なので env から取得.
 * 未設定の場合は @ai-sdk/google-vertex 側で実行時に「missing」エラーが出る (意図通り).
 */
const vertex = createVertex({
  project: process.env.GOOGLE_VERTEX_PROJECT,
  location: process.env.GOOGLE_VERTEX_LOCATION,
});

/** デフォルト: Vertex AI の Gemini 3.1 Flash Lite Preview (速くて安い). */
export const DEFAULT_MODEL_SPEC = "vertex:gemini-3.1-flash-lite-preview";

/**
 * spec を AI SDK の LanguageModel インスタンスに解決する.
 * - 不明な provider はエラーで弾く (`vertex`, `gemini`/`google`, `ollama` のみ受け付け)
 * - `:` を含むモデル名 (e.g. `gemma3:4b`) も `ollama:gemma3:4b` のように渡せば動く.
 *   実装では先頭の最初の `:` だけで provider と modelId を分割する.
 */
export function resolveModel(spec: string | undefined): LanguageModel {
  const s = (spec ?? DEFAULT_MODEL_SPEC).trim();
  const sep = s.indexOf(":");
  if (sep < 0) {
    throw new Error(
      `invalid model spec: ${s}. format: <provider>:<model>  e.g. vertex:gemini-3.1-flash-lite-preview, ollama:gemma3:4b`
    );
  }
  const provider = s.slice(0, sep).toLowerCase();
  // ollama のモデル名は `gemma3:4b` のように `:` を含むので、最初の `:` 以降を全部 modelId として扱う
  const modelId = s.slice(sep + 1);
  if (!modelId) {
    throw new Error(`empty model id in spec: ${s}`);
  }
  switch (provider) {
    case "vertex":
      return vertex(modelId);
    case "gemini":
    case "google":
      // @ai-sdk/google は GOOGLE_GENERATIVE_AI_API_KEY を自動的に env から拾う.
      return google(modelId);
    case "ollama": {
      // OLLAMA_BASE_URL 未設定なら localhost を使う. WSL→Windows ホスト等の参照は env で設定する想定.
      const ollama = createOllama({
        baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/api",
      });
      return ollama(modelId);
    }
    default:
      throw new Error(
        `unknown provider: ${provider}. supported: vertex, gemini, ollama`
      );
  }
}

/** spec の表示用ヘルパ. 未指定なら DEFAULT を表示. CLI の起動メッセージで使う. */
export function describeSpec(spec: string | undefined): string {
  return spec ?? DEFAULT_MODEL_SPEC;
}
