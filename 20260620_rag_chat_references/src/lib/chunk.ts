import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";

// 構造認識チャンク化(見出し→ブロック)。各チャンクは生 markdown への
// char offset を保持し、プレビューで該当箇所を正確にハイライトできる。

export type RawChunk = {
  ordinal: number;
  blockType: string;
  headingDepth: number | null;
  headingPath: string[];
  headingText: string | null;
  charStart: number;
  charEnd: number;
  content: string;
  tokenEstimate: number;
};

// 1チャンクの目安上限(文字)。gemini-embedding は ~2048 token なので余裕。
const MAX_CHARS = 2000;

// frontmatter(---...---)を yaml ノードとして扱う(setext 見出しへの誤解析を防ぐ)
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml"]);

function estTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function mapType(t: string): string {
  switch (t) {
    case "list":
    case "table":
    case "code":
    case "paragraph":
    case "blockquote":
      return t;
    case "heading":
      return "heading";
    case "yaml":
      return "frontmatter";
    default:
      return "other";
  }
}

// 大きすぎるブロックを char offset を保ったまま分割
function lineWindows(raw: string, start: number, end: number): [number, number][] {
  const text = raw.slice(start, end);
  const lines = text.split(/(?<=\n)/); // 改行を残して分割
  const segs: [number, number][] = [];
  let segStart = start;
  let cur = start;
  for (const line of lines) {
    if (cur > segStart && cur + line.length - segStart > MAX_CHARS) {
      segs.push([segStart, cur]);
      segStart = cur;
    }
    cur += line.length;
  }
  if (cur > segStart) segs.push([segStart, cur]);
  return segs;
}

function splitBlock(
  node: any,
  raw: string,
  start: number,
  end: number,
): [number, number][] {
  if (end - start <= MAX_CHARS) return [[start, end]];

  // リストは項目境界でまとめる
  if (node.type === "list" && Array.isArray(node.children) && node.children.length) {
    const segs: [number, number][] = [];
    let curStart = node.children[0].position.start.offset as number;
    let curEnd = curStart;
    for (const item of node.children) {
      const iStart = item.position.start.offset as number;
      const iEnd = item.position.end.offset as number;
      if (curEnd > curStart && iEnd - curStart > MAX_CHARS) {
        segs.push([curStart, curEnd]);
        curStart = iStart;
      }
      curEnd = iEnd;
    }
    if (curEnd > curStart) segs.push([curStart, curEnd]);

    // 巨大な単一項目はさらに行分割
    const final: [number, number][] = [];
    for (const [s, e] of segs) {
      if (e - s <= MAX_CHARS) final.push([s, e]);
      else final.push(...lineWindows(raw, s, e));
    }
    return final;
  }

  return lineWindows(raw, start, end);
}

export function chunkMarkdown(raw: string): RawChunk[] {
  const tree = processor.parse(raw) as any;
  const out: RawChunk[] = [];
  const headingStack: { depth: number; text: string }[] = [];
  let ordinal = 0;

  const push = (
    blockType: string,
    start: number,
    end: number,
    headingDepth: number | null = null,
  ) => {
    const content = raw.slice(start, end);
    if (!content.trim()) return;
    out.push({
      ordinal: ordinal++,
      blockType,
      headingDepth,
      headingPath: headingStack.map((h) => h.text),
      headingText: headingStack.length
        ? headingStack[headingStack.length - 1].text
        : null,
      charStart: start,
      charEnd: end,
      content,
      tokenEstimate: estTokens(content),
    });
  };

  for (const node of tree.children as any[]) {
    if (!node.position) continue;
    const start = node.position.start.offset as number;
    const end = node.position.end.offset as number;

    if (node.type === "heading") {
      const depth = node.depth as number;
      while (
        headingStack.length &&
        headingStack[headingStack.length - 1].depth >= depth
      ) {
        headingStack.pop();
      }
      const text = raw
        .slice(start, end)
        .replace(/^#{1,6}\s*/, "")
        .replace(/\s+#*\s*$/, "")
        .trim();
      headingStack.push({ depth, text });
      push("heading", start, end, depth);
      continue;
    }

    for (const [s, e] of splitBlock(node, raw, start, end)) {
      push(mapType(node.type), s, e);
    }
  }

  return out;
}
