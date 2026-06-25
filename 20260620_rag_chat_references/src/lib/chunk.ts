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

// 隣接する小さなチャンクを同一 headingPath 内でまとめ上げる後処理。
// - blockType === 'heading' のチャンクは変更せず、マージの境界として機能する。
// - 同一 headingPath(スペース結合で比較)のチャンクのみ連結候補。
// - 連結後の span 長が MAX_CHARS を超えないこと。
// - 連結後の content = raw.slice(charStart, charEnd) が成立する
//   (連結 span は先頭.charStart〜末尾.charEnd の連続区間なので常に成立)。
// - floor 未満でも heading 境界や MAX_CHARS 制限で flush されたランはそのまま出力。
// - blockType は "merged" に統一(単体チャンクは元の blockType を維持)。
// - ordinal は出力順に 0..n-1 で振り直す。
function floorMerge(chunks: RawChunk[], raw: string, floor = 400): RawChunk[] {
  const result: RawChunk[] = [];

  // run = 現在蓄積中の連結候補リスト
  let run: RawChunk[] = [];

  const flushRun = () => {
    if (run.length === 0) return;
    if (run.length === 1) {
      result.push(run[0]);
    } else {
      const first = run[0];
      const last = run[run.length - 1];
      const charStart = first.charStart;
      const charEnd = last.charEnd;
      const content = raw.slice(charStart, charEnd);
      result.push({
        ordinal: 0, // 後で振り直す
        blockType: "merged",
        headingDepth: first.headingDepth,
        headingPath: first.headingPath,
        headingText: first.headingText,
        charStart,
        charEnd,
        content,
        tokenEstimate: Math.ceil(content.length / 4),
      });
    }
    run = [];
  };

  for (const chunk of chunks) {
    // heading チャンクはマージに参加しない — まず蓄積中の run を flush してから通す
    if (chunk.blockType === "heading") {
      flushRun();
      result.push(chunk);
      continue;
    }

    if (run.length === 0) {
      run.push(chunk);
      continue;
    }

    const runHead = run[0];
    // headingPath が異なる → 境界: flush してから新しい run を開始
    if (runHead.headingPath.join(" ") !== chunk.headingPath.join(" ")) {
      flushRun();
      run.push(chunk);
      continue;
    }

    // 連結すると MAX_CHARS を超える → flush してから新しい run を開始
    const accumulatedEnd = chunk.charEnd;
    const accumulatedStart = runHead.charStart;
    if (accumulatedEnd - accumulatedStart > MAX_CHARS) {
      flushRun();
      run.push(chunk);
      continue;
    }

    // 連結可能: run に追加
    run.push(chunk);

    // 蓄積内容が floor に達したら flush
    const spanLen = run[run.length - 1].charEnd - run[0].charStart;
    if (spanLen >= floor) {
      flushRun();
    }
  }

  // 末尾残り
  flushRun();

  // ordinal を 0..n-1 で振り直す
  for (let i = 0; i < result.length; i++) {
    result[i] = { ...result[i], ordinal: i };
  }

  return result;
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

  return floorMerge(out, raw);
}
