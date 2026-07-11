export const A2A_HOST = process.env.A2A_HOST ?? "localhost";
export const A2A_PORT = Number(process.env.A2A_PORT ?? 41241);
export const A2A_BASE_URL = `http://${A2A_HOST}:${A2A_PORT}`;

// llama-server (llama.cpp) の OpenAI 互換エンドポイント
export const LLM_BASE_URL = process.env.LLM_BASE_URL ?? "http://localhost:8080/v1";
// 1.7B はチャットには十分だが、複数ツールのオーケストレーションで
// tool_calls が生JSONテキスト化する揺らぎがあったため 4B を採用
export const LLM_MODEL =
  process.env.LLM_MODEL ?? "Qwen3-4B-Instruct-2507-Q4_K_M.gguf";
