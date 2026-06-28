// head-to-head 生成: 各質問について vector / keyword / hybrid の3手法で本番パイプラインを駆動し、
// 回答“全文”を保存する。模範解答(target_answer)は一切使わない。採点は別途、Claude が
// 実ソース文書(docs/<target_md>)に照らして3回答を直接突き合わせて行う(reference-free head-to-head)。
//   bun run scripts/eval/headtohead.ts [--gold queries.json] [--n 999] [--concurrency 6]
//
// 出力: results/h2h-<gold>-<sha>-<ts>.json  cases[].methods.{vector,keyword,hybrid}.{answer,citedFiles,retrievedFiles,usage}

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { appendFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";
import { assertEnv } from "../../src/lib/env";
import { sql } from "../../src/lib/db";
import { runSearchAgent, streamAnswer } from "../../src/lib/agents";
import { withUsage, recordLLM, newTally, type UsageTally } from "../../src/lib/usage";
import type { GoldCase, Mode } from "./types";

const ROOT = join(import.meta.dirname, "..", "..");
const RESULTS_DIR = join(import.meta.dirname, "results");
const MODES: Mode[] = ["vector", "keyword", "hybrid"];

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
async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i + Math.floor(Math.random() * 600)));
    }
  }
  throw last;
}

// 本番と同じ消費の仕方で1手法の回答全文を取り出す(judge は無し)。
async function genOne(question: string, mode: Mode) {
  const result = await runSearchAgent(question, null, mode);
  const stream = streamAnswer(question, result);
  let last: { blocks?: { text?: string; citations?: number[] }[] } = {};
  for await (const part of stream.partialObjectStream) last = part as typeof last;
  const u = await stream.usage;
  recordLLM(u?.inputTokens, u?.outputTokens);
  const blocks = (last.blocks ?? []).filter(Boolean);
  const answer = blocks.map((b) => b?.text ?? "").join("\n\n").trim();
  const cited = new Set<number>();
  for (const b of blocks) for (const c of b?.citations ?? []) cited.add(c);
  const byId = new Map(result.chunks.map((c) => [c.id, c]));
  const citedFiles = [...new Set([...cited].map((id) => byId.get(id)?.filename).filter(Boolean))] as string[];
  const retrievedFiles = [...new Set(result.chunks.map((c) => c.filename))];
  return { answer, citedFiles, retrievedFiles };
}

async function main() {
  assertEnv();
  const goldFile = arg("gold", "queries.json")!;
  const n = Number(arg("n", "999"));
  const conc = Number(arg("concurrency", "6"));
  const gold = (JSON.parse(await readFile(join(ROOT, goldFile), "utf8")) as GoldCase[]).slice(0, n);
  console.log(`h2h gen: gold=${goldFile} n=${gold.length} modes=${MODES.join(",")} conc=${conc} chatModel=${process.env.GEMINI_CHAT_MODEL}`);

  const PROGRESS = join(RESULTS_DIR, ".h2h-progress");
  await mkdir(RESULTS_DIR, { recursive: true });
  writeFileSync(PROGRESS, `h2h start n=${gold.length} conc=${conc}\n`);
  let done = 0;

  const addInto = (acc: UsageTally, u?: UsageTally) => {
    if (!u) return acc;
    acc.llmIn += u.llmIn; acc.llmOut += u.llmOut; acc.llmCalls += u.llmCalls;
    acc.embedTokens += u.embedTokens; acc.embedCalls += u.embedCalls;
    return acc;
  };

  const runCase = async (g: GoldCase) => {
    // 3手法を並列に駆動(高速化)。各手法は withUsage でトークンを按分し withRetry で rate-limit を吸収。
    const results = await Promise.all(
      MODES.map(async (mode) => {
        try {
          const { value, usage } = await withRetry(() => withUsage(() => genOne(g.question, mode)));
          return [mode, { ...value, usage }] as const;
        } catch (e) {
          return [mode, { error: String(e) }] as const;
        }
      }),
    );
    const methods: Record<string, any> = {};
    for (const [mode, v] of results) methods[mode] = v;
    // 1リクエスト(=1質問)の全体トークン消費 = 3手法の合算。
    const totalUsage = results.reduce((acc, [, v]) => addInto(acc, (v as any).usage), newTally());
    done++;
    appendFileSync(PROGRESS, `${done}/${gold.length} ${new Date().toISOString()}\n`);
    if (done % 5 === 0) console.log(`  ${done}/${gold.length}`);
    return {
      question: g.question,
      domain: g.domain,
      type: g.type,
      targetFile: basename(g.target_md),
      targetMd: g.target_md,
      methods,
      totalUsage, // 1リクエストでの全体トークン消費(3手法合算)
    };
  };

  const cases: unknown[] = new Array(gold.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(conc, gold.length) }, async () => {
      while (next < gold.length) {
        const idx = next++;
        cases[idx] = await runCase(gold[idx]);
      }
    }),
  );

  // トークン総計: 手法別 + 全体(全リクエスト合算)、1リクエスト平均も。
  const byMode: Record<string, UsageTally> = Object.fromEntries(MODES.map((m) => [m, newTally()]));
  const grand = newTally();
  let okReqs = 0;
  for (const c of cases as any[]) {
    if (!c) continue;
    okReqs++;
    for (const m of MODES) addInto(byMode[m], c.methods?.[m]?.usage);
    addInto(grand, c.totalUsage);
  }
  const perRequest = {
    llmIn: grand.llmIn / (okReqs || 1), llmOut: grand.llmOut / (okReqs || 1),
    llmTotal: (grand.llmIn + grand.llmOut) / (okReqs || 1),
    embedTokens: grand.embedTokens / (okReqs || 1),
  };

  const record = {
    meta: { entry: "h2h", goldFile, gitSha: gitSha(), timestamp: new Date().toISOString(), n: gold.length, modes: MODES },
    tokens: { grandTotal: grand, byMode, perRequestMean: perRequest, requests: okReqs },
    cases,
  };
  console.log(
    `tokens grand: LLM in=${grand.llmIn} out=${grand.llmOut} embed=${grand.embedTokens} over ${okReqs} requests` +
      `\nper-request(3手法合算) mean: LLM in=${perRequest.llmIn.toFixed(0)} out=${perRequest.llmOut.toFixed(0)} embed=${perRequest.embedTokens.toFixed(0)}`,
  );
  const out = join(RESULTS_DIR, `h2h-${goldFile.replace(/[^a-z0-9]/gi, "_")}-${record.meta.gitSha}-${Date.now()}.json`);
  await writeFile(out, JSON.stringify(record, null, 2));
  console.log(`\nwrote ${out}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
