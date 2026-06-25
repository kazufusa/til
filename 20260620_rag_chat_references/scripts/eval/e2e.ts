// e2e 評価(Phase 1c): 本番パイプライン(runSearchAgent → streamAnswer)を駆動し、
// 生成回答を judge で target_answer と突き合わせて正答率を測る。
//   bun run scripts/eval/e2e.ts [--n 50] [--gold queries.json]
//
// judge は独立採点: question + target_answer + 生成回答 のみを見る(検索チャンクは見せない=F判リーク防止)。
// ファイル Hit が飽和した今(E節)、これが改善を測る本命の指標。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { appendFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";
import { generateObject } from "ai";
import { z } from "zod";
import { assertEnv } from "../../src/lib/env";
import { sql } from "../../src/lib/db";
import { chatModel } from "../../src/lib/vertex";
import { runSearchAgent, streamAnswer } from "../../src/lib/agents";
import type { GoldCase } from "./types";

const ROOT = join(import.meta.dirname, "..", "..");
const RESULTS_DIR = join(import.meta.dirname, "results");

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

// N件を全体から均等サンプル(domain/type が偏らないよう間引き)。決定的。
function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

const JudgeSchema = z.object({
  score: z
    .number()
    .int()
    .min(0)
    .max(2)
    .describe("2=主要事実を正しく網羅 / 1=部分的or軽微な誤り欠落 / 0=誤り・未回答・矛盾"),
  reason: z.string().describe("1文の根拠"),
});

async function judge(question: string, target: string, answer: string) {
  const { object } = await generateObject({
    model: chatModel,
    schema: JudgeSchema,
    temperature: 0,
    system:
      "あなたは厳格な採点者です。模範解答に照らして、回答が主要な事実を正しく伝えているかだけを採点します。文体や言い回しは問わない。検索資料は与えられないので、模範解答を正解の基準とすること。",
    prompt: `# 質問\n${question}\n\n# 模範解答(正解基準)\n${target}\n\n# 採点対象の回答\n${answer}\n\n上記回答を 0/1/2 で採点せよ。`,
  });
  return object;
}

// 本番と同じ消費の仕方で最終 blocks を取り出す(route.ts と同じ)。
async function generateAnswer(question: string) {
  const result = await runSearchAgent(question, null);
  const { partialObjectStream } = streamAnswer(question, result);
  let last: { blocks?: { text?: string; citations?: number[] }[] } = {};
  for await (const part of partialObjectStream) last = part as typeof last;
  const blocks = (last.blocks ?? []).filter(Boolean);
  const answerText = blocks.map((b) => b?.text ?? "").join("\n\n").trim();
  const cited = new Set<number>();
  for (const b of blocks) for (const c of b?.citations ?? []) cited.add(c);
  const byId = new Map(result.chunks.map((c) => [c.id, c]));
  const citedFiles = [...cited].map((id) => byId.get(id)?.filename).filter(Boolean) as string[];
  const retrievedFiles = result.chunks.map((c) => c.filename);
  return { answerText, citedFiles, retrievedFiles };
}

async function main() {
  assertEnv();
  const n = Number(arg("n", "50"));
  const goldFile = arg("gold", "queries.json")!;
  const gold = sample(JSON.parse(await readFile(join(ROOT, goldFile), "utf8")) as GoldCase[], n);
  // --runs k: 各問を k 回実行(エージェント非決定のノイズ低減)。集計は全 N×k で取る。
  const runs = Number(arg("runs", "1"));
  const jobs = runs > 1 ? gold.flatMap((g) => Array.from({ length: runs }, () => g)) : gold;
  console.log(`eval:e2e n=${gold.length} runs=${runs} jobs=${jobs.length} gold=${goldFile} judge=同一chatModel`);

  // 各問は独立で大半が API 待ち → 同時実行で高速化(既定6、Vertex レート/PGプール max:10 を考慮)。
  const conc = Number(arg("concurrency", "6"));
  console.log(`(concurrency=${conc})`);
  // 進捗を即時 flush でファイルに書く(stdout はパイプだとバッファされ live で見えないため)。
  // 監視: tail -f scripts/eval/results/.e2e-progress
  const PROGRESS = join(RESULTS_DIR, ".e2e-progress");
  await mkdir(RESULTS_DIR, { recursive: true });
  writeFileSync(PROGRESS, `e2e start n=${gold.length} runs=${runs} jobs=${jobs.length} conc=${conc}\n`);
  let done = 0;
  const runCase = async (g: GoldCase) => {
    const targetFile = basename(g.target_md);
    try {
      const { answerText, citedFiles, retrievedFiles } = await generateAnswer(g.question);
      const j = await judge(g.question, g.target_answer, answerText);
      return {
        question: g.question,
        domain: g.domain,
        type: g.type,
        targetFile,
        score: j.score,
        reason: j.reason,
        citedTargetFile: citedFiles.includes(targetFile),
        retrievedTargetFile: retrievedFiles.includes(targetFile),
        answerPreview: answerText.slice(0, 160),
      };
    } catch (e) {
      return { question: g.question, domain: g.domain, type: g.type, targetFile, score: null, error: String(e) };
    } finally {
      done++;
      appendFileSync(PROGRESS, `${done}/${jobs.length} ${new Date().toISOString()}\n`);
      if (done % 5 === 0) console.log(`  ${done}/${jobs.length}`);
    }
  };
  // 順序保持つき並列プール
  const cases: any[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(conc, jobs.length) }, async () => {
      while (next < jobs.length) {
        const idx = next++;
        cases[idx] = await runCase(jobs[idx]);
      }
    }),
  );

  const scored = cases.filter((c) => typeof c.score === "number");
  const mean = scored.reduce((s, c) => s + c.score, 0) / (scored.length || 1);
  const correct = scored.filter((c) => c.score === 2).length / (scored.length || 1);
  const partialUp = scored.filter((c) => c.score >= 1).length / (scored.length || 1);
  const citedOK = scored.filter((c) => c.citedTargetFile).length / (scored.length || 1);
  // 平均スコアの標準誤差→95%CI(ノイズ帯)。delta がこの帯を超えて初めて「有意」と言える。
  const variance = scored.reduce((s, c) => s + (c.score - mean) ** 2, 0) / (scored.length || 1);
  const se = Math.sqrt(variance / (scored.length || 1));
  const ci95 = 1.96 * se;
  // runs>1: 質問ごとに k 回平均(ノイズ低減した per-question 推定)
  const perQ = new Map<string, number[]>();
  for (const c of scored) (perQ.get(c.question) ?? perQ.set(c.question, []).get(c.question)!).push(c.score);
  const perQMean = [...perQ.values()].map((a) => a.reduce((x, y) => x + y, 0) / a.length);
  const meanOfQ = perQMean.reduce((x, y) => x + y, 0) / (perQMean.length || 1);

  const record = {
    meta: { entry: "e2e", goldFile, gitSha: gitSha(), timestamp: new Date().toISOString(), n: gold.length, runs, jobs: jobs.length, scored: scored.length },
    summary: { mean, ci95, correct, partialUp, citedOK, meanOfQ, questions: perQMean.length },
    cases,
  };
  await mkdir(RESULTS_DIR, { recursive: true });
  const out = join(RESULTS_DIR, `e2e-${goldFile.replace(/[^a-z0-9]/gi, "_")}-${record.meta.gitSha}-${Date.now()}.json`);
  await writeFile(out, JSON.stringify(record, null, 2));

  console.log(`\n# e2e (questions=${perQMean.length} runs=${runs} jobs scored=${scored.length})`);
  console.log(`mean score (0-2): ${mean.toFixed(3)} ± ${ci95.toFixed(3)} (95%CI)`);
  console.log(`correct (=2):     ${(correct * 100).toFixed(1)}%`);
  console.log(`partial+ (>=1):   ${(partialUp * 100).toFixed(1)}%`);
  console.log(`cited target file:${(citedOK * 100).toFixed(1)}%`);
  if (cases.length - scored.length) console.log(`errors: ${cases.length - scored.length}`);
  console.log(`\nwrote ${out}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
