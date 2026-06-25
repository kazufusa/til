// e2e 2結果の paired 比較(同一質問で問題ごとに差分→質問難易度の分散を相殺し、mean-vs-mean より高感度)。
//   bun run scripts/eval/compare.ts <A.json> <B.json>   (delta = B - A)
// 各質問の平均スコア(runs 平均)を A/B で突き合わせ、paired delta ± 95%CI / 勝敗 / 符号検定。
import { readFileSync } from "node:fs";

function perQuestionMean(path: string): Map<string, number> {
  const d = JSON.parse(readFileSync(path, "utf8"));
  const acc = new Map<string, { s: number; n: number }>();
  for (const c of d.cases) {
    if (typeof c.score !== "number") continue;
    const a = acc.get(c.question) ?? { s: 0, n: 0 };
    a.s += c.score; a.n += 1; acc.set(c.question, a);
  }
  const m = new Map<string, number>();
  for (const [q, a] of acc) m.set(q, a.s / a.n);
  return m;
}

const [pa, pb] = process.argv.slice(2);
if (!pa || !pb) { console.error("usage: compare.ts <A.json> <B.json>  (delta=B-A)"); process.exit(1); }
const A = perQuestionMean(pa), B = perQuestionMean(pb);

const deltas: number[] = [];
let win = 0, loss = 0, tie = 0;
for (const [q, a] of A) {
  if (!B.has(q)) continue;
  const d = B.get(q)! - a;
  deltas.push(d);
  if (d > 1e-9) win++; else if (d < -1e-9) loss++; else tie++;
}
const n = deltas.length;
const mean = deltas.reduce((x, y) => x + y, 0) / (n || 1);
const sd = Math.sqrt(deltas.reduce((s, d) => s + (d - mean) ** 2, 0) / (n || 1));
const se = sd / Math.sqrt(n || 1);
const ci = 1.96 * se;
const meanA = [...A.values()].reduce((x, y) => x + y, 0) / A.size;
const meanB = [...B.values()].reduce((x, y) => x + y, 0) / B.size;

const sig = Math.abs(mean) > ci && n > 0;
console.log(`paired 比較 (n=${n}問, delta = B - A)`);
console.log(`  A = ${pa.split("/").pop()}  mean=${meanA.toFixed(3)}`);
console.log(`  B = ${pb.split("/").pop()}  mean=${meanB.toFixed(3)}`);
console.log(`  paired delta = ${mean >= 0 ? "+" : ""}${mean.toFixed(3)} ± ${ci.toFixed(3)} (95%CI)`);
console.log(`  改善 ${win} / 悪化 ${loss} / 同 ${tie}`);
console.log(`  判定: ${sig ? (mean > 0 ? "B が有意に良い ✅" : "B が有意に悪い ❌") : "有意差なし(ノイズ内) —"}`);
