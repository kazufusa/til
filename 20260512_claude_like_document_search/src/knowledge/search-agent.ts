// ============================================================================
// search-agent.ts — Chat Agent の searchKnowledge ツール内部で動く検索エージェント.
//
// 役割:
// - listDocuments / searchDocuments / grepBlocks / readBlocks を駆使して
//   ユーザー質問に関する原文確認済み evidence を集める.
// - 最終回答は書かない. 構造化された SearchKnowledgeOutput JSON を返すだけ.
// - 最大 12 ステップまでツール呼び出しを繰り返す (stepCountIs).
//
// 設計のポイント:
// - LLM の最終出力 (テキスト) から JSON を抽出するために手動 parser を持つ.
//   structured output (generateObject) はツール併用との相性が AI SDK 6 でやや弱く、
//   テキスト出力 → JSON 抽出 → zod で寛容パース、が最も安定する.
// - LLM がスキーマからわずかにズレた JSON を返しても拾えるよう寛容処理 (normalizeOutput).
//   実例: relevance="High" / "中" / status="partial found" 等を吸収.
// - CDCS_VERBOSE=0 でなければ stderr に [search] ログを流す. Chat の挙動を観察するため.
// ============================================================================

import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { searchAgentTools } from "./tools";
import { searchAgentSystemPrompt } from "./prompts";
import { resolveModel } from "./model";
import type {
  SearchKnowledgeInput,
  SearchKnowledgeOutput,
} from "./types";

/**
 * evidence 1 件の zod スキーマ.
 * default() を多用して、LLM が欠損フィールドを返しても通るようにしている.
 * (relevance や reason は LLM が省略しがちなので default を入れている)
 */
const evidenceSchema = z.object({
  path: z.string(),
  title: z.string().optional(),
  docType: z.string().optional(),
  headingPath: z.array(z.string()).default([]),
  blockStartIndex: z.number().int().min(0),
  blockEndIndex: z.number().int().min(0),
  quote: z.string(),
  relevance: z.enum(["high", "medium", "low"]).default("medium"),
  reason: z.string().default(""),
});

/**
 * 全体出力スキーマ. 全フィールド default 付きの寛容版.
 * LLM が "evidences" を omit しても [] とみなして通す等の挙動.
 */
const outputSchema = z.object({
  status: z.enum(["found", "partial", "not_found"]).default("not_found"),
  searchedQueries: z.array(z.string()).default([]),
  evidences: z.array(evidenceSchema).default([]),
  notes: z.string().optional(),
});

/**
 * 検索エージェント本体. Chat Agent の searchKnowledge ツール内から呼ばれる.
 *
 * @param input    質問 + 優先 docType
 * @param options  modelSpec で実行モデルを差し替え可能 (CLI の --search-model 由来)
 * @returns        evidence 配列を含む SearchKnowledgeOutput
 *
 * 流れ:
 * 1. system prompt (探索戦略) + user prompt (質問 + JSON フォーマット要求) を渡す
 * 2. generateText に tools と stopWhen を渡してエージェントループを走らせる
 * 3. LLM が最終的に出力するテキストから JSON を抽出 → 寛容パース
 * 4. パース失敗時は status="not_found" として notes に原文を入れて返す
 */
export async function runSearchAgent(
  input: SearchKnowledgeInput,
  options?: { modelSpec?: string }
): Promise<SearchKnowledgeOutput> {
  // user prompt. JSON フォーマットを毎回明示するのは、LLM が独自フォーマットに走るのを防ぐため.
  const userMessage = [
    `# 質問`,
    input.question,
    input.preferredDocType && input.preferredDocType.length > 0
      ? `\n# 優先 docType\n${input.preferredDocType.join(", ")}`
      : "",
    `\n探索を行い、最後に **必ず** 次の JSON 形式だけを コードフェンス無しで 出力してください:`,
    `{`,
    `  "status": "found" | "partial" | "not_found",`,
    `  "searchedQueries": [...],`,
    `  "evidences": [{ "path", "title?", "docType?", "headingPath", "blockStartIndex", "blockEndIndex", "quote", "relevance", "reason" }, ...],`,
    `  "notes": "..."`,
    `}`,
  ].join("\n");

  // 内部挙動のログ. CDCS_VERBOSE=0 なら無音.
  // 終端制御 \x1b[2m...\x1b[0m は dim (灰色) で chat の本文と視覚的に区別する.
  // stderr に出して、Chat Agent の出力 (stdout) とは別系統にしている.
  const verbose = process.env.CDCS_VERBOSE !== "0";
  const log = (s: string) => {
    if (verbose) process.stderr.write(`\x1b[2m  [search] ${s}\x1b[0m\n`);
  };
  log(`Q: ${input.question}`);

  const res = await generateText({
    model: resolveModel(options?.modelSpec),
    system: searchAgentSystemPrompt,
    prompt: userMessage,
    tools: searchAgentTools,
    // 探索が長引いても 12 step で必ず止める. 多段検索の上限.
    stopWhen: stepCountIs(12),
    // ツール選択を安定させたいので低めの温度.
    temperature: 0.2,
    // ステップ毎にツール呼び出し/結果を [search] ログに流す.
    onStepFinish: ({ toolCalls, toolResults }) => {
      for (const call of toolCalls) {
        const args = JSON.stringify(call.input);
        log(`-> ${call.toolName}(${args.length > 250 ? args.slice(0, 250) + "…" : args})`);
      }
      for (const r of toolResults) {
        log(`<- ${r.toolName} ${summarizeToolResult(r.toolName, r.output)}`);
      }
    },
  });

  // LLM 最終応答テキスト → JSON 抽出 → 寛容スキーマで検証
  const text = res.text.trim();
  const parsed = tryParseJSON(text);
  if (parsed && typeof parsed === "object") {
    // evidences が配列でない / status が変な文字列、等を吸収
    const fixed = normalizeOutput(parsed);
    const v = outputSchema.safeParse(fixed);
    if (v.success) return v.data;
    // スキーマ違反: 失敗理由を notes に入れて Chat Agent に伝える
    return {
      status: "not_found",
      searchedQueries: [],
      evidences: [],
      notes: `evidence JSON のスキーマ検証失敗: ${v.error.message.slice(0, 400)}`,
    };
  }
  // JSON すら抽出できなかった: LLM 応答全体を notes に入れて返す
  return {
    status: "not_found",
    searchedQueries: [],
    evidences: [],
    notes: `evidence JSON がパースできませんでした (LLM 応答):\n${text.slice(0, 500)}`,
  };
}

/**
 * ツール結果を 1 行に要約する.
 * フル JSON だと長すぎる/読みにくいので、ツール毎に「何件取れたか」「サンプル数件」を抜粋.
 * これで stderr ログが流れても全体像が一目で追える.
 */
function summarizeToolResult(name: string, out: unknown): string {
  if (!out || typeof out !== "object") return String(out);
  const o = out as Record<string, unknown>;
  if (name === "listDocuments" || name === "searchDocuments") {
    const docs = (o.documents as { path?: string }[] | undefined) ?? [];
    const sample = docs
      .slice(0, 3)
      .map((d) => d.path)
      .filter(Boolean)
      .join(", ");
    return `${docs.length} docs${docs.length > 0 ? ` [${sample}${docs.length > 3 ? "…" : ""}]` : ""}`;
  }
  if (name === "grepBlocks") {
    const hits = (o.hits as { path?: string; blockIndex?: number }[] | undefined) ?? [];
    const sample = hits
      .slice(0, 3)
      .map((h) => `${h.path}#${h.blockIndex}`)
      .join(", ");
    return `${hits.length} hits${hits.length > 0 ? ` [${sample}${hits.length > 3 ? "…" : ""}]` : ""}`;
  }
  if (name === "readBlocks") {
    const blocks = (o.blocks as { blockIndex?: number }[] | undefined) ?? [];
    const path = (o.path as string | undefined) ?? "";
    const range =
      blocks.length === 0
        ? "(empty)"
        : `${blocks[0]?.blockIndex}..${blocks[blocks.length - 1]?.blockIndex}`;
    return `${path} blocks=${range} (${blocks.length})`;
  }
  return JSON.stringify(out).slice(0, 120);
}

/**
 * LLM 出力 JSON の「揺れ」を吸収する正規化.
 * - evidences が配列でない → []
 * - searchedQueries が配列でない → []
 * - status 欠損 → evidences の有無で found/not_found を推定
 * - 各 evidence は normalizeEvidence で個別に整形 & 不正なものは drop
 */
function normalizeOutput(o: unknown): unknown {
  if (!o || typeof o !== "object") return { status: "not_found" };
  const r = o as Record<string, unknown>;
  if (!Array.isArray(r.evidences)) r.evidences = [];
  if (!Array.isArray(r.searchedQueries)) r.searchedQueries = [];
  if (typeof r.status !== "string") {
    r.status = (r.evidences as unknown[]).length > 0 ? "found" : "not_found";
  }
  r.status = normalizeStatus(r.status);
  r.evidences = (r.evidences as unknown[])
    .map(normalizeEvidence)
    .filter((e) => e !== null);
  return r;
}

/**
 * status の表記揺れを吸収.
 * 例: "Found", "FOUND", "partial found", "no info" → enum 値にマップ.
 */
function normalizeStatus(v: unknown): "found" | "partial" | "not_found" {
  if (typeof v !== "string") return "not_found";
  const s = v.toLowerCase().trim();
  if (s.includes("found") && !s.includes("not")) return "found";
  if (s.includes("partial") || s.includes("partly")) return "partial";
  return "not_found";
}

/**
 * relevance の表記揺れを吸収.
 * "High" "高" "強" → high, "Low" "低" "弱" → low, それ以外は medium.
 * LLM が日本語や首字大文字で返してきても拾えるようにする.
 */
function normalizeRelevance(v: unknown): "high" | "medium" | "low" {
  if (typeof v !== "string") return "medium";
  const s = v.toLowerCase().trim();
  if (s.startsWith("h") || s.includes("高") || s.includes("強")) return "high";
  if (s.startsWith("l") || s.includes("低") || s.includes("弱")) return "low";
  return "medium";
}

/**
 * evidence 1 件の正規化.
 * - path が無い/空 → null (drop)
 * - headingPath が配列でない / 非文字列が混入 → 文字列配列に強制
 * - blockStartIndex/blockEndIndex が文字列 "12" 等で来ても Number() で吸収
 * - relevance は normalizeRelevance で吸収
 */
function normalizeEvidence(e: unknown): Record<string, unknown> | null {
  if (!e || typeof e !== "object") return null;
  const o = { ...(e as Record<string, unknown>) };
  if (typeof o.path !== "string" || o.path.length === 0) return null;
  if (!Array.isArray(o.headingPath)) o.headingPath = [];
  o.headingPath = (o.headingPath as unknown[])
    .map((x) => (typeof x === "string" ? x : String(x ?? "")))
    .filter((x): x is string => x.length > 0);
  if (typeof o.blockStartIndex !== "number")
    o.blockStartIndex = Number(o.blockStartIndex ?? 0) || 0;
  if (typeof o.blockEndIndex !== "number")
    o.blockEndIndex = Number(o.blockEndIndex ?? o.blockStartIndex) || 0;
  if (typeof o.quote !== "string") o.quote = String(o.quote ?? "");
  o.relevance = normalizeRelevance(o.relevance);
  if (typeof o.reason !== "string") o.reason = String(o.reason ?? "");
  return o;
}

/**
 * LLM 応答テキストから JSON を抽出してパースする.
 *
 * - ```json ... ``` のコードフェンスがあれば中身を取る
 * - 無ければ全文に対して、最初の `{` から最後の `}` までを切り出す
 *   (LLM が前後に説明文を付けて返すケースを救済)
 * - 失敗したら null. 呼び出し側が status=not_found に倒す.
 */
function tryParseJSON(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  const candidate = fence ? fence[1]! : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}
