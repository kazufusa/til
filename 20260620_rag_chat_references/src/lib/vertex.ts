import { createVertex } from "@ai-sdk/google-vertex";
import { env } from "./env";

// project / location は .env から。認証は ADC か GOOGLE_APPLICATION_CREDENTIALS。
export const vertex = createVertex({
  project: env.GOOGLE_VERTEX_PROJECT,
  location: env.GOOGLE_VERTEX_LOCATION,
});

export const chatModel = vertex(env.GEMINI_CHAT_MODEL);
export const EMBEDDING_DIM = env.EMBEDDING_DIM;

// 埋め込みは gemini-embedding 系 = :embedContent が必要なため、
// 同梱の textEmbeddingModel(:predict) ではなく自作アダプタを使う(embedding-model.ts)。
