import type { EmbeddingModelV3 } from "@ai-sdk/provider";
import { GoogleAuth } from "google-auth-library";
import { env } from "./env";

// gemini-embedding-2 系は Vertex の :predict ではなく :embedContent (Gemini系API) で
// 呼ぶ必要がある。同梱の @ai-sdk/google-vertex(4.0.145)の embeddingModel は :predict 固定
// なので、AI SDK の拡張点である EmbeddingModelV3 を自作して embed/embedMany に渡す。
// 認証は Vertex と同じ ADC / サービスアカウント(google-auth-library)。

const auth = new GoogleAuth({
  scopes: "https://www.googleapis.com/auth/cloud-platform",
});
let clientPromise: ReturnType<GoogleAuth["getClient"]> | null = null;

async function getAccessToken(): Promise<string> {
  if (!clientPromise) clientPromise = auth.getClient();
  const client = await clientPromise;
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Vertex のアクセストークン取得に失敗しました");
  return token;
}

function embedContentUrl(): string {
  // gemini-embedding 系は :embedContent。global では v1beta1 が必要。
  const loc = env.GOOGLE_VERTEX_LOCATION;
  const host =
    loc === "global"
      ? "https://aiplatform.googleapis.com"
      : `https://${loc}-aiplatform.googleapis.com`;
  return `${host}/v1beta1/projects/${env.GOOGLE_VERTEX_PROJECT}/locations/${loc}/publishers/google/models/${env.GEMINI_EMBEDDING_MODEL}:embedContent`;
}

type VertexEmbedOptions = {
  taskType?: string;
  outputDimensionality?: number;
};

// AI SDK に渡す EmbeddingModel 実装(:embedContent 版)
export function createGeminiEmbeddingModel(): EmbeddingModelV3 {
  return {
    specificationVersion: "v3",
    provider: "google.vertex.embedContent",
    modelId: env.GEMINI_EMBEDDING_MODEL,
    // embedContent は1件ずつ。並列は AI SDK 側に任せる。
    maxEmbeddingsPerCall: 1,
    supportsParallelCalls: true,

    async doEmbed({ values, providerOptions, abortSignal, headers }) {
      const opts = (providerOptions?.vertex ?? {}) as VertexEmbedOptions;
      const token = await getAccessToken();
      const url = embedContentUrl();
      const embeddings: number[][] = [];
      let totalTokens = 0; // usageMetadata があれば集計(評価のトークン計測用)

      for (const value of values) {
        const res = await fetch(url, {
          method: "POST",
          signal: abortSignal,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(headers ?? {}),
          },
          body: JSON.stringify({
            content: { parts: [{ text: value }] },
            outputDimensionality:
              opts.outputDimensionality ?? env.EMBEDDING_DIM,
            taskType: opts.taskType,
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(
            `embedContent failed (${res.status}) at ${url}: ${body.slice(0, 300)}`,
          );
        }
        const data = (await res.json()) as {
          embedding?: { values: number[] };
          usageMetadata?: { totalTokenCount?: number };
        };
        const vals = data.embedding?.values;
        if (!vals?.length) {
          throw new Error("embedContent: レスポンスに embedding がありません");
        }
        embeddings.push(vals);
        totalTokens += data.usageMetadata?.totalTokenCount ?? 0;
      }

      // usage を返すと AI SDK の embed()/embedMany() が result.usage.tokens で受け取れる。
      // usageMetadata が無いレスポンスでも tokens:0 で安全(呼び出し側で文字数推定にフォールバック)。
      return { embeddings, usage: { tokens: totalTokens }, warnings: [] };
    },
  };
}
