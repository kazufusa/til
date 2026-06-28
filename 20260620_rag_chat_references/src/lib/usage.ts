// 手法別トークン消費の計測(評価用)。AsyncLocalStorage で「いま計測中の1ケース」に
// LLM / embedding のトークンを按分する。e2e は concurrency>1 で複数ケースを並行に回すが、
// 各ケースを withUsage で包めば store がケースごとに分離するので混ざらない。
//
// 本番(route.ts)は withUsage を呼ばない → getStore() が undefined → record* は no-op。
// よって計測は eval 専用で、本番挙動・コストには一切影響しない。
import { AsyncLocalStorage } from "node:async_hooks";

export type UsageTally = {
  llmIn: number; // LLM 入力トークン合計(検索エージェント + 回答合成。judge は含めない)
  llmOut: number; // LLM 出力トークン合計
  llmCalls: number; // LLM 呼び出し回数(generateText 1 + streamObject 1 が基本)
  embedTokens: number; // クエリ埋め込みの入力トークン合計(keyword は 0)
  embedCalls: number; // 埋め込み呼び出し回数(= vector/hybrid の検索回数に比例)
};

const als = new AsyncLocalStorage<UsageTally>();

export function newTally(): UsageTally {
  return { llmIn: 0, llmOut: 0, llmCalls: 0, embedTokens: 0, embedCalls: 0 };
}

// fn を新しい計測コンテキストで実行し、結果と按分されたトークン量を返す。
export async function withUsage<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; usage: UsageTally }> {
  const usage = newTally();
  const value = await als.run(usage, fn);
  return { value, usage };
}

export function recordLLM(inputTokens?: number, outputTokens?: number): void {
  const t = als.getStore();
  if (!t) return;
  t.llmIn += inputTokens ?? 0;
  t.llmOut += outputTokens ?? 0;
  t.llmCalls += 1;
}

export function recordEmbed(tokens?: number): void {
  const t = als.getStore();
  if (!t) return;
  t.embedTokens += tokens ?? 0;
  t.embedCalls += 1;
}
