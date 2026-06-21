import { embed, embedMany } from "ai";
import { EMBEDDING_DIM } from "./vertex";
import { createGeminiEmbeddingModel } from "./embedding-model";

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

// クエリ側の埋め込み(検索時)
export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
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
  return embedding;
}
