import { embed, embedMany } from "ai";
import { EMBEDDING_DIM } from "./vertex";
import { createGeminiEmbeddingModel } from "./embedding-model";
import { recordEmbed } from "./usage";

// AI SDK の embed/embedMany を使う。モデルは :embedContent アダプタ。
const model = createGeminiEmbeddingModel();

// ドキュメント側の埋め込み(取込時)
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model,
    values: texts,
    maxRetries: 4,
    providerOptions: {
      vertex: {
        outputDimensionality: EMBEDDING_DIM,
        taskType: "RETRIEVAL_DOCUMENT",
      },
    },
  });
  for (const e of embeddings) {
    if (e.length !== EMBEDDING_DIM) {
      throw new Error(
        `embedding dim mismatch: got ${e.length}, expected ${EMBEDDING_DIM}`,
      );
    }
  }
  return embeddings;
}

// 埋め込み入力テキストを組み立てる共通ヘルパー。
// 見出しパスをコンテキストとして前置きすることで短いブロックの検索精度を改善する。
// ※ DB に保存する content / char_start / char_end は変更しない(ハイライト不変条件を維持)。
export function embedText(chunk: {
  headingPath: string[];
  content: string;
}): string {
  if (chunk.headingPath.length === 0) return chunk.content;
  return chunk.headingPath.join(" > ") + "\n\n" + chunk.content;
}

// クエリ側の埋め込み(検索時)
export async function embedQuery(text: string): Promise<number[]> {
  const { embedding, usage } = await embed({
    model,
    value: text,
    maxRetries: 4,
    providerOptions: {
      vertex: {
        outputDimensionality: EMBEDDING_DIM,
        taskType: "RETRIEVAL_QUERY",
      },
    },
  });
  // 評価のトークン計測(本番では withUsage 外なので no-op)。
  // API が usageMetadata を返さない場合は文字数からの粗い推定(~4 char/token)にフォールバック。
  recordEmbed(usage?.tokens || Math.ceil(text.length / 4));
  return embedding;
}
