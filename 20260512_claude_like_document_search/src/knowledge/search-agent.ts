// Search Agent: 低レベルツールを使って evidence を集める.
// 最終的に SearchKnowledgeOutput の JSON を返す.

import { generateText, stepCountIs } from "ai";
import { z } from "zod";
import { searchAgentTools } from "./tools";
import { searchAgentSystemPrompt } from "./prompts";
import { resolveModel } from "./model";
import type {
  SearchKnowledgeInput,
  SearchKnowledgeOutput,
} from "./types";

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

// 寛容スキーマ: 欠損フィールドはデフォルト値で補う
const outputSchema = z.object({
  status: z.enum(["found", "partial", "not_found"]).default("not_found"),
  searchedQueries: z.array(z.string()).default([]),
  evidences: z.array(evidenceSchema).default([]),
  notes: z.string().optional(),
});

export async function runSearchAgent(
  input: SearchKnowledgeInput,
  options?: { modelSpec?: string }
): Promise<SearchKnowledgeOutput> {
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
    stopWhen: stepCountIs(12),
    temperature: 0.2,
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

  const text = res.text.trim();
  const parsed = tryParseJSON(text);
  if (parsed && typeof parsed === "object") {
    // 寛容処理: evidences が配列でない場合は強制的に []
    const fixed = normalizeOutput(parsed);
    const v = outputSchema.safeParse(fixed);
    if (v.success) return v.data;
    return {
      status: "not_found",
      searchedQueries: [],
      evidences: [],
      notes: `evidence JSON のスキーマ検証失敗: ${v.error.message.slice(0, 400)}`,
    };
  }
  return {
    status: "not_found",
    searchedQueries: [],
    evidences: [],
    notes: `evidence JSON がパースできませんでした (LLM 応答):\n${text.slice(0, 500)}`,
  };
}

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

function normalizeStatus(v: unknown): "found" | "partial" | "not_found" {
  if (typeof v !== "string") return "not_found";
  const s = v.toLowerCase().trim();
  if (s.includes("found") && !s.includes("not")) return "found";
  if (s.includes("partial") || s.includes("partly")) return "partial";
  return "not_found";
}

function normalizeRelevance(v: unknown): "high" | "medium" | "low" {
  if (typeof v !== "string") return "medium";
  const s = v.toLowerCase().trim();
  if (s.startsWith("h") || s.includes("高") || s.includes("強")) return "high";
  if (s.startsWith("l") || s.includes("低") || s.includes("弱")) return "low";
  return "medium";
}

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

function tryParseJSON(text: string): unknown {
  // ```json ... ``` で囲まれている場合の抽出
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  const candidate = fence ? fence[1]! : text;
  // 最初の `{` から最後の `}` までを抽出
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
