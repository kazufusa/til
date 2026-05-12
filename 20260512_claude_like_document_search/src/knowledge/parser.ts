// シンプルな markdown → blocks パーサ
// - heading で heading_path を追跡
// - 連続行はパラグラフ単位でブロック化 (空行で区切り)
// - リスト・table・code は塊単位でブロック化
//
// 完璧な markdown AST ではなく、検索用途で十分な粒度を目指す。

import type { BlockType } from "./types";

export type ParsedBlock = {
  blockIndex: number;
  blockType: BlockType;
  headingPath: string[];
  text: string;
};

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

export function parseMarkdown(md: string): ParsedBlock[] {
  const lines = md.split(/\r?\n/);
  const blocks: ParsedBlock[] = [];
  const headingStack: { level: number; title: string }[] = [];
  let i = 0;

  const currentHeadingPath = () => headingStack.map((h) => h.title);

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

    // heading
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
