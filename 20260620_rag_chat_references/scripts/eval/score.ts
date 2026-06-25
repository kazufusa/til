// 検索評価の採点(決定的・LLM不要)。
//   bun run scripts/eval/score.ts <results/xxx.json> [results/yyy.json (baseline)]
//
// Hit@k / MRR を全体＋ domain / type 別に算出。第2引数を渡すと baseline との delta を出す。
// [F4] JP はファイル単位 Hit が天井(docs md にページ境界が無い)。英語セットは将来
//      heading/snippet で細かく測る(本ファイルはまずファイル単位 Hit を実装)。

import { readFile } from "node:fs/promises";
import type { RunRecord, RetrievalCaseResult } from "./types";

const KS = [1, 3, 5, 10];

type Metrics = { n: number; hitAt: Record<number, number>; mrr: number };

// 1問の正解順位(1始まり)。見つからなければ 0。
function firstHitRank(c: RetrievalCaseResult): number {
  const idx = c.hitFilenames.findIndex((f) => f === c.targetFilename);
  return idx < 0 ? 0 : idx + 1;
}

function metricsOf(cases: RetrievalCaseResult[]): Metrics {
  const hitAt: Record<number, number> = {};
  for (const k of KS) hitAt[k] = 0;
  let mrrSum = 0;
  for (const c of cases) {
    const rank = firstHitRank(c);
    if (rank > 0) {
      mrrSum += 1 / rank;
      for (const k of KS) if (rank <= k) hitAt[k]++;
    }
  }
  const n = cases.length || 1;
  for (const k of KS) hitAt[k] = hitAt[k] / n;
  return { n: cases.length, hitAt, mrr: mrrSum / n };
}

function groupBy(
  cases: RetrievalCaseResult[],
  key: "domain" | "type",
): Map<string, RetrievalCaseResult[]> {
  const m = new Map<string, RetrievalCaseResult[]>();
  for (const c of cases) {
    const g = c[key] || "(none)";
    (m.get(g) ?? m.set(g, []).get(g)!).push(c);
  }
  return m;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function line(label: string, m: Metrics, base?: Metrics): string {
  const d = (k: number) =>
    base ? ` (${m.hitAt[k] - base.hitAt[k] >= 0 ? "+" : ""}${((m.hitAt[k] - base.hitAt[k]) * 100).toFixed(1)})` : "";
  const dm = base
    ? ` (${m.mrr - base.mrr >= 0 ? "+" : ""}${(m.mrr - base.mrr).toFixed(3)})`
    : "";
  return [
    label.padEnd(20),
    `n=${String(m.n).padStart(4)}`,
    ...KS.map((k) => `H@${k}=${pct(m.hitAt[k])}${d(k)}`),
    `MRR=${m.mrr.toFixed(3)}${dm}`,
  ].join("  ");
}

async function load(path: string): Promise<RunRecord> {
  return JSON.parse(await readFile(path, "utf8")) as RunRecord;
}

async function main() {
  const path = process.argv[2];
  const basePath = process.argv[3];
  if (!path) {
    console.error("usage: bun run scripts/eval/score.ts <results.json> [baseline.json]");
    process.exit(1);
  }
  const run = await load(path);
  const base = basePath ? await load(basePath) : null;
  const baseByKey = (cases: RetrievalCaseResult[]) => metricsOf(cases);

  console.log(
    `# ${run.meta.entry} mode=${run.meta.mode} k=${run.meta.k} gold=${run.meta.goldFile} sha=${run.meta.gitSha}`,
  );
  if (base) console.log(`# baseline: mode=${base.meta.mode} sha=${base.meta.gitSha} (delta = run - baseline)`);
  console.log();

  console.log(line("OVERALL", metricsOf(run.cases), base ? baseByKey(base.cases) : undefined));

  for (const key of ["domain", "type"] as const) {
    console.log(`\n[by ${key}]`);
    const g = groupBy(run.cases, key);
    const bg = base ? groupBy(base.cases, key) : null;
    for (const [name, cs] of [...g.entries()].sort()) {
      console.log(line(`  ${name}`, metricsOf(cs), bg?.get(name) ? metricsOf(bg.get(name)!) : undefined));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
