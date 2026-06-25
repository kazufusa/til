// 検索評価ランナー(Phase 1a: eval:retrieval / 決定的・LLM不要)。
//   bun run scripts/eval/run.ts --mode hybrid --k 10 [--gold queries.json] [--limit N]
//
// retrieval 層だけを対象に、ゴールドの各質問を retrieve(mode) で引き、
// top-k チャンクの由来ファイルを記録する。採点は score.ts。
// agentic / e2e エントリは後続(B.3)。ここでは決定的な retrieval のみ。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";
import { assertEnv } from "../../src/lib/env";
import { sql } from "../../src/lib/db";
import { retrieve, type GoldCase, type Mode, type RunRecord } from "./types";

const ROOT = join(import.meta.dirname, "..", "..");
const RESULTS_DIR = join(import.meta.dirname, "results");

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

async function main() {
  assertEnv();
  const mode = (arg("mode", "hybrid") as Mode) ?? "hybrid";
  const k = Number(arg("k", "10"));
  const goldFile = arg("gold", "queries.json")!;
  const limit = arg("limit") ? Number(arg("limit")) : Infinity;

  if (!["vector", "keyword", "hybrid"].includes(mode)) {
    throw new Error(`invalid --mode: ${mode}`);
  }

  // [F1] 決定性の担保: HNSW の探索幅を固定する。
  // 注: postgres.js はプール接続なので厳密には全接続に効かない。
  //     完全な bit 安定が要る比較では max:1 の専用接続に移す(B.5 F1)。
  await sql`SET hnsw.ef_search = 200`.catch(() => {});

  const raw = await readFile(join(ROOT, goldFile), "utf8");
  const gold = (JSON.parse(raw) as GoldCase[]).slice(0, limit);

  console.log(
    `eval:retrieval mode=${mode} k=${k} gold=${goldFile} n=${gold.length}`,
  );

  const cases: RunRecord["cases"] = [];
  let i = 0;
  for (const g of gold) {
    const hits = await retrieve(g.question, k, mode);
    cases.push({
      question: g.question,
      domain: g.domain,
      type: g.type,
      targetFilename: basename(g.target_md),
      hitFilenames: hits.map((h) => h.filename),
      hitChunkIds: hits.map((h) => h.id),
    });
    if (++i % 25 === 0) console.log(`  ${i}/${gold.length}`);
  }

  const record: RunRecord = {
    meta: {
      entry: "retrieval",
      mode,
      k,
      goldFile,
      gitSha: gitSha(),
      timestamp: new Date().toISOString(),
      n: gold.length,
    },
    cases,
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  const runId = `retrieval-${mode}-${goldFile.replace(/[^a-z0-9]/gi, "_")}-${record.meta.gitSha}-${Date.now()}`;
  const out = join(RESULTS_DIR, `${runId}.json`);
  await writeFile(out, JSON.stringify(record, null, 2));
  console.log(`\nwrote ${out}`);
  console.log(`score: bun run scripts/eval/score.ts ${out}`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
