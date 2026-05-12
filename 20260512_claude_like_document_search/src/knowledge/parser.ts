// ============================================================================
// parser.ts — 自前の軽量 markdown → blocks パーサ.
//
// なぜ自作?:
// - remark / unified を入れるほどリッチな AST は要らない (検索したいだけ)
// - 必要なのは「heading 階層を追えること」と「table/list/code を 1 ブロックにまとめること」
// - blocks テーブルの粒度はあえて粗め (= 1 段落 ≈ 1 ブロック)、
//   readBlocks で前後数ブロック取れば文脈は復元できるという設計思想.
//
// 仕様 (おおまか):
// - heading (#, ##, ...) で `headingStack` を更新. すべての後続 block に `headingPath` が乗る.
// - ``` で囲まれた fenced code → 1 ブロック (block_type="code")
// - `|...|` 連続行 → 1 ブロック (block_type="table")
// - `-` `*` `+` `1.` で始まる連続行 → 1 ブロック (block_type="list")
// - 空行で区切られた平文 → 1 ブロック (block_type="paragraph")
// - `---` だけの区切り線、空行はスキップ.
// ============================================================================

import type { BlockType } from "./types";

/** parser の出力 1 個分. block_index は最後に DB へ書く時に使う 0-based の通し番号. */
export type ParsedBlock = {
  blockIndex: number;
  blockType: BlockType;
  headingPath: string[];
  text: string;
};

/** ATX heading (# h1, ## h2, ...). setext (=== / ---) は変換側 (Gemini) が ATX に揃える前提で未対応. */
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

/**
 * Markdown 全文をブロックに分解する.
 * @param md  markdown 原文
 * @returns   block_index 0 始まりのブロック配列
 */
export function parseMarkdown(md: string): ParsedBlock[] {
  // 改行は \n / \r\n を許容
  const lines = md.split(/\r?\n/);
  const blocks: ParsedBlock[] = [];
  // heading の入れ子を level で追跡するスタック.
  // 例: # A → ## B → ### C と進んだ時点で stack = [{1,A},{2,B},{3,C}].
  const headingStack: { level: number; title: string }[] = [];
  let i = 0;

  const currentHeadingPath = () => headingStack.map((h) => h.title);

  // ブロックを 1 個追加するヘルパ. 空白だけのブロックは捨てる.
  const pushBlock = (type: BlockType, text: string) => {
    const trimmed = text.replace(/\s+$/, "");
    if (!trimmed.trim()) return;
    blocks.push({
      blockIndex: blocks.length,
      blockType: type,
      headingPath: currentHeadingPath(),
      text: trimmed,
    });
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // --- heading ---
    // 見出しが来たら stack を「自分と同じ or 下位レベル」のものまで pop して自分を push.
    // これで例えば ## が現れたら、それ以降の ### / #### は新しい ## の配下になる.
    const h = line.match(HEADING_RE);
    if (h) {
      const level = h[1]!.length;
      const title = h[2]!.trim();
      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1]!.level >= level
      ) {
        headingStack.pop();
      }
      headingStack.push({ level, title });
      blocks.push({
        blockIndex: blocks.length,
        blockType: "heading",
        headingPath: currentHeadingPath(),
        text: title,
      });
      i++;
      continue;
    }

    // fenced code
    if (/^```/.test(line)) {
      const codeStart = i;
      const buf: string[] = [line];
      i++;
      while (i < lines.length) {
        buf.push(lines[i]!);
        if (/^```/.test(lines[i] ?? "")) {
          i++;
          break;
        }
        i++;
      }
      pushBlock("code", buf.join("\n"));
      void codeStart;
      continue;
    }

    // table (連続する pipe を含む行を 1 ブロックに)
    if (/^\s*\|.*\|/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*\|.*\|/.test(lines[i] ?? "")) {
        buf.push(lines[i]!);
        i++;
      }
      pushBlock("table", buf.join("\n"));
      continue;
    }

    // list (連続する `-` / `*` / `1.` を 1 ブロックに)
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const buf: string[] = [];
      while (
        i < lines.length &&
        (/^\s*([-*+]|\d+\.)\s+/.test(lines[i] ?? "") ||
          /^\s{2,}\S/.test(lines[i] ?? "") ||
          /^\s*$/.test(lines[i] ?? ""))
      ) {
        // 空行が2連続したら終了
        if (
          /^\s*$/.test(lines[i] ?? "") &&
          /^\s*$/.test(lines[i + 1] ?? "")
        ) {
          break;
        }
        buf.push(lines[i]!);
        i++;
      }
      pushBlock("list", buf.join("\n").replace(/\s+$/, ""));
      continue;
    }

    // 空行 → スキップ
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // 区切り線 `---` 単体 → スキップ
    if (/^---+\s*$/.test(line)) {
      i++;
      continue;
    }

    // それ以外: 段落 (空行までを 1 ブロックに)
    const buf: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i] ?? "") &&
      !HEADING_RE.test(lines[i] ?? "") &&
      !/^```/.test(lines[i] ?? "") &&
      !/^\s*\|.*\|/.test(lines[i] ?? "") &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[i] ?? "") &&
      !/^---+\s*$/.test(lines[i] ?? "")
    ) {
      buf.push(lines[i]!);
      i++;
    }
    pushBlock("paragraph", buf.join("\n"));
  }

  return blocks;
}
