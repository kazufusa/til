// 英語コーパス(markdowns/)から日本語質問のゴールドセットを生成する。
// 設計詳細: ACCURACY_IMPROVEMENT.md B.3 / "英語コーパス" 設計議論。
//
// 実行: bun run scripts/eval/gen-cases.ts
// 出力: queries.en.json (プロジェクトルート)
//
// 方針:
//  - 質問は日本語(cross-lingual: 日本語 question × 英語 source)
//  - 対象: 散文ファイル(system-design-primer, k8s-changelog, build-your-own-x, ...)
//          AND リンク列挙ファイル(awesome-*, public-apis, free-programming-books-*)
//  - 目標: ~20件 (候補 ~30 まで生成してから品質ゲートで絞る)
//  - DB には触れない。外部呼び出しは Vertex LLM のみ。

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { generateObject } from "ai";
import { z } from "zod";
import { assertEnv } from "../../src/lib/env";
import { chatModel } from "../../src/lib/vertex";
import { chunkMarkdown, type RawChunk } from "../../src/lib/chunk";
import type { GoldCase } from "./types";

const ROOT = join(import.meta.dirname, "..", "..");
const MARKDOWNS_DIR = join(ROOT, "markdowns");
const OUTPUT_FILE = join(ROOT, "queries.en.json");

// ファイル分類: prose = 散文主体 / linklist = リンク列挙主体
const LINKLIST_PATTERNS = [
  "awesome",
  "public-apis",
  "free-programming-books",
  "free-for-dev",
  "book-of-secret-knowledge",
  "build-your-own-x",
];

function classifyFile(name: string): "prose" | "linklist" {
  const lower = name.toLowerCase();
  return LINKLIST_PATTERNS.some((p) => lower.includes(p)) ? "linklist" : "prose";
}

// "answerable" チャンクかを判定する:
//  - heading 型は除外
//  - 短すぎる(<120 chars)は除外
//  - 好ましいブロック型: paragraph / list / table / code / blockquote
function isAnswerable(chunk: RawChunk): boolean {
  if (chunk.blockType === "heading") return false;
  if (chunk.blockType === "frontmatter") return false;
  if (chunk.blockType === "other") return false;
  if (chunk.content.trim().length < 120) return false;
  return true;
}

// stride サンプリング(決定的): answerable chunks の配列から idx ごとに stride 飛ばし
// 各ファイルから最大 maxPerFile 件抽出し、全体で cap まで集める。
function strideSelect(
  answerable: { file: string; chunk: RawChunk }[],
  cap: number,
  stride: number,
): { file: string; chunk: RawChunk }[] {
  const result: { file: string; chunk: RawChunk }[] = [];
  for (let i = 0; i < answerable.length && result.length < cap; i += stride) {
    result.push(answerable[i]);
  }
  return result;
}

// LLM: 候補セクションから日本語Q&Aを生成
const qaSchema = z.object({
  question: z
    .string()
    .describe("この英語セクションの内容のみで答えられる日本語の質問"),
  target_answer: z
    .string()
    .describe("そのセクションの内容に基づいた日本語の回答(200字以内)"),
  type: z
    .enum(["paragraph", "list", "table", "code"])
    .describe("このセクションのブロック種別"),
});

// LLM: 品質ゲート — grounded & !generic を確認
const gateSchema = z.object({
  grounded: z
    .boolean()
    .describe(
      "target_answer の主張がセクションテキストに明確に記述されているか",
    ),
  generic: z
    .boolean()
    .describe(
      "質問がセクションを読まなくても一般知識だけで答えられるか(true=汎用すぎて却下)",
    ),
});

async function generateQA(
  sectionText: string,
): Promise<z.infer<typeof qaSchema>> {
  const { object } = await generateObject({
    model: chatModel,
    temperature: 0,
    schema: qaSchema,
    prompt: `以下は英語技術ドキュメントの一節です。
この一節の内容だけを根拠として答えられる、具体的な日本語の質問と回答を生成してください。
質問は「このドキュメントを知っている人が調べるであろう具体的な事実・仕様・リスト」を尋ねるものにしてください。
一般常識だけで答えられる汎用的な質問は避けてください。

セクションテキスト:
---
${sectionText.slice(0, 1500)}
---`,
  });
  return object;
}

async function qualityGate(
  sectionText: string,
  question: string,
  targetAnswer: string,
): Promise<z.infer<typeof gateSchema>> {
  const { object } = await generateObject({
    model: chatModel,
    temperature: 0,
    schema: gateSchema,
    prompt: `以下のセクションテキスト、質問、回答を評価してください。

セクションテキスト:
---
${sectionText.slice(0, 1500)}
---

質問: ${question}
回答: ${targetAnswer}

評価基準:
- grounded: 回答の主張がセクションテキストに明記されているか (単なる推測や一般知識でないか)
- generic: 質問がこのセクションを読まなくても一般知識のみで正確に答えられるか`,
  });
  return object;
}

async function main() {
  assertEnv();

  // 1. markdowns/*.md を読み込み、README.md は除外
  const allFiles = (await readdir(MARKDOWNS_DIR))
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort();

  console.log(`Found ${allFiles.length} markdown files`);

  // 2. 各ファイルをチャンク化し、answerable チャンクを収集
  type Candidate = {
    file: string;
    fileClass: "prose" | "linklist";
    chunk: RawChunk;
  };

  const allAnswerable: Candidate[] = [];

  for (const filename of allFiles) {
    const filePath = join(MARKDOWNS_DIR, filename);
    const raw = await readFile(filePath, "utf8");
    const chunks = chunkMarkdown(raw);
    const answerable = chunks.filter(isAnswerable);
    const fileClass = classifyFile(filename);
    for (const chunk of answerable) {
      allAnswerable.push({ file: filename, fileClass, chunk });
    }
    console.log(
      `  ${filename}: ${chunks.length} chunks, ${answerable.length} answerable (${fileClass})`,
    );
  }

  console.log(`\nTotal answerable chunks: ${allAnswerable.length}`);

  // 3. stride サンプリングで ~30 候補を選ぶ
  //    stride を計算: answerable.length / 30 で均等に間隔を取る
  const TARGET_CANDIDATES = 30;
  const stride = Math.max(1, Math.floor(allAnswerable.length / TARGET_CANDIDATES));
  let candidates = strideSelect(allAnswerable, TARGET_CANDIDATES, stride);

  // ファイルカバレッジ確認
  const coveredFiles = new Set(candidates.map((c) => c.file));
  console.log(
    `\nSelected ${candidates.length} candidates (stride=${stride}), covering ${coveredFiles.size} files:`,
  );
  const fileCounts: Record<string, number> = {};
  for (const c of candidates) {
    fileCounts[c.file] = (fileCounts[c.file] ?? 0) + 1;
  }
  for (const [f, n] of Object.entries(fileCounts).sort()) {
    console.log(`  ${f}: ${n}`);
  }

  // ファイルカバレッジが偏っている場合、未カバーのファイルから追加補充
  const missingFiles = allFiles.filter(
    (f) => f !== "README.md" && !coveredFiles.has(f),
  );
  if (missingFiles.length > 0) {
    console.log(
      `\nAdding fallback candidates for ${missingFiles.length} uncovered files...`,
    );
    for (const filename of missingFiles) {
      const fallback = allAnswerable.find((c) => c.file === filename);
      if (fallback) {
        candidates.push(fallback);
        console.log(`  +${filename}`);
      }
    }
  }

  // 4. 各候補から Q&A 生成 → 品質ゲート → 20件になったら停止
  const TARGET_KEPT = 20;
  const kept: GoldCase[] = [];
  let discarded = 0;
  let processed = 0;

  console.log(`\n--- Generating Q&A with quality gate (target: ${TARGET_KEPT} kept) ---`);

  for (const cand of candidates) {
    if (kept.length >= TARGET_KEPT) break;
    processed++;

    const sectionText = cand.chunk.content;
    const fileBasename = cand.file;
    const targetMd = `markdowns/${fileBasename}`;

    process.stdout.write(
      `[${processed}/${candidates.length}] ${fileBasename} (${cand.chunk.blockType}) ... `,
    );

    try {
      // Q&A 生成
      const qa = await generateQA(sectionText);

      // 品質ゲート
      const gate = await qualityGate(sectionText, qa.question, qa.target_answer);

      if (gate.grounded && !gate.generic) {
        const goldCase: GoldCase = {
          question: qa.question,
          target_answer: qa.target_answer,
          target_file: fileBasename,
          target_md: targetMd,
          target_page_no: null,
          target_heading_path: cand.chunk.headingPath,
          target_snippet: sectionText.slice(0, 300),
          domain: "tech",
          type: qa.type,
          lang: "ja",
        };
        kept.push(goldCase);
        console.log(`KEPT (${kept.length}/${TARGET_KEPT})`);
      } else {
        discarded++;
        const reason = !gate.grounded ? "not grounded" : "too generic";
        console.log(`DISCARD (${reason})`);
      }
    } catch (err) {
      discarded++;
      console.log(`ERROR: ${(err as Error).message.slice(0, 80)}`);
    }
  }

  console.log(`\n--- Done ---`);
  console.log(`Kept: ${kept.length}, Discarded: ${discarded}, Processed: ${processed}`);

  // カバレッジ集計
  const keptFileCounts: Record<string, number> = {};
  const keptClassCounts: Record<string, number> = {};
  for (const g of kept) {
    keptFileCounts[g.target_file] = (keptFileCounts[g.target_file] ?? 0) + 1;
    keptClassCounts[g.type] = (keptClassCounts[g.type] ?? 0) + 1;
  }
  console.log("\nFile coverage in kept cases:");
  for (const [f, n] of Object.entries(keptFileCounts).sort()) {
    console.log(`  ${f}: ${n}`);
  }
  console.log("Type distribution:", keptClassCounts);

  // 5. queries.en.json 出力
  await writeFile(OUTPUT_FILE, JSON.stringify(kept, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${kept.length} cases to ${OUTPUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
