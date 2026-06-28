// 精度評価ハーネスの共有型。設計は ACCURACY_IMPROVEMENT.md B 節に対応。

import * as R from "../../src/lib/retrieval";

// queries.json / queries.en.json のゴールド1件。
// JP(queries.json)は target_page_no を持つが docs md にページ境界が無いため使わない(F4)。
// 英語(queries.en.json)は target_heading_path / target_snippet を持たせて細かく測る。
export type GoldCase = {
  question: string;
  target_answer: string;
  target_file: string; // 例: "01.pdf"
  target_md: string; // 例: "docs/01.pdf.md"
  target_page_no?: string | null;
  target_heading_path?: string[]; // 英語セットのみ
  target_snippet?: string; // 英語セットのみ
  domain: string;
  type: string; // paragraph | list | table | code ...
  lang?: string; // 英語セット: 質問言語(現状は日本語=cross-lingual)
};

// 検索モード(B.2.1)。hybrid が現状の挙動。retrieval.ts の RetrievalMode が正(単一の真実)。
export type Mode = R.RetrievalMode;

// 1問の検索結果(決定的・retrieval 層)。
export type RetrievalCaseResult = {
  question: string;
  domain: string;
  type: string;
  targetFilename: string; // basename(target_md) = source.filename と突き合わせる
  // top-k チャンクの由来ファイル名(順位順)。Hit/MRR はこれだけで決定的に算出できる。
  hitFilenames: string[];
  hitChunkIds: number[];
};

// run 1回ぶんの記録。results/<runId>.json に保存。
export type RunRecord = {
  meta: {
    entry: "retrieval" | "agentic" | "e2e";
    mode: Mode;
    k: number;
    goldFile: string;
    gitSha: string;
    timestamp: string; // 呼び出し側で注入
    n: number;
  };
  cases: RetrievalCaseResult[];
};

// retrieve ディスパッチャは retrieval.ts に昇格済み(agentic 経路でも mode-swap を使うため)。
// run.ts の後方互換のためここで再エクスポートする。
export const retrieve = R.retrieve;
