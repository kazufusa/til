// モデル指定の抽象化.
// spec の書式:
//   vertex:gemini-3.1-flash-lite-preview   ... Vertex AI (ADC, 既定)
//   gemini:gemini-3.1-flash-lite-preview   ... Gemini Developer API (要 GOOGLE_GENERATIVE_AI_API_KEY)
//   ollama:gemma3:4b                       ... ローカル Ollama (要 OLLAMA_BASE_URL or default http://localhost:11434)
//   ollama:qwen2.5-coder:14b
//
// CLI から --model vertex:gemini-3.1-flash-lite-preview のように渡す.

import { createVertex } from "@ai-sdk/google-vertex";
import { google } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider-v2";
import type { LanguageModel } from "ai";

// Vertex AI provider は env (GOOGLE_VERTEX_PROJECT, GOOGLE_VERTEX_LOCATION) から
// project/location を読む. .env.example を参考に .env を用意してください.
// bun は .env を自動でロードする.
const vertex = createVertex({
  project: process.env.GOOGLE_VERTEX_PROJECT,
  location: process.env.GOOGLE_VERTEX_LOCATION,
});

export const DEFAULT_MODEL_SPEC = "vertex:gemini-3.1-flash-lite-preview";

export function resolveModel(spec: string | undefined): LanguageModel {
  const s = (spec ?? DEFAULT_MODEL_SPEC).trim();
  const sep = s.indexOf(":");
  if (sep < 0) {
    throw new Error(
      `invalid model spec: ${s}. format: <provider>:<model>  e.g. vertex:gemini-3.1-flash-lite-preview, ollama:gemma3:4b`
    );
  }
  const provider = s.slice(0, sep).toLowerCase();
  const modelId = s.slice(sep + 1);
  if (!modelId) {
    throw new Error(`empty model id in spec: ${s}`);
  }
  switch (provider) {
    case "vertex":
      return vertex(modelId);
    case "gemini":
    case "google":
      return google(modelId);
    case "ollama": {
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

export function describeSpec(spec: string | undefined): string {
  return spec ?? DEFAULT_MODEL_SPEC;
}
