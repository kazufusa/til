"""PDF を Vertex AI Gemini で markdown 化する.

usage: python scripts/pdf_to_md.py pdfs/foo.pdf docs/foo.md

環境変数:
  GOOGLE_VERTEX_PROJECT   Vertex AI を使う GCP project id (必須)
  GOOGLE_VERTEX_LOCATION  リージョン (default: global)
  CDCS_PDF_MODEL          利用モデル (default: gemini-3.1-flash-lite-preview)
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from google import genai
from google.genai import types


def _require_env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise SystemExit(
            f"環境変数 {name} を設定してください "
            f"(.env を参照、または `export {name}=...`)"
        )
    return v


PROJECT = _require_env("GOOGLE_VERTEX_PROJECT")
LOCATION = os.environ.get("GOOGLE_VERTEX_LOCATION", "global")
MODEL = os.environ.get("CDCS_PDF_MODEL", "gemini-3.1-flash-lite-preview")

PROMPT = """\
このPDFを RAG (検索拡張生成) 用の **検索可能な markdown** に変換してください。
要約せず、PDFに書かれている全情報を抽出してください。日本語のまま (翻訳禁止)。

# 全体ルール
- 出力は markdown 本体のみ。前置き・後書き・```markdown フェンス禁止
- 全ページを順に処理。途中省略禁止
- ページ番号・ヘッダー/フッターの繰り返しは除去
- 見出しは `#` `##` `###` で論理階層を付与
- 段落本文はそのまま転記 (改行は適切に整える)

# 表 (table)
- すべての表は markdown table で表現
- 全ての行・列・セル値を残す。「(以下略)」「(中略)」のような省略は禁止
- セル結合がある場合は最も自然なフラット表現に展開
- 表の前にタイトル/出典/単位を明記
- 列ヘッダーが日本語であることを確認

# 図・グラフ・チャート (重要)
グラフや図は **要約せず、データを再構成して** markdown で書き出すこと。
- 棒グラフ・折れ線グラフ・円グラフ: 読み取れる全データ点を markdown table に書き起こす
  - 表題、X軸ラベル、Y軸ラベル(単位含む)、凡例、出典を明記
  - 例: 「2017年: 45,234人」「2018年: 43,118人」...と各年/各カテゴリの値を列挙
  - 値が概算であれば「約45,000人」のように記録、ただし読み取れる値を全て残す
- 散布図: 各データ点 (X, Y) を列挙
- 構成図・フロー図・組織図・概念図:
  - 含まれる全要素 (ボックス/ノード/ラベル) を箇条書きで列挙
  - 矢印・接続関係を「A → B (条件: ...)」の形式で記述
  - 図のタイトル・凡例も記載
- 地図・写真・イラスト: キャプションと、視認できる文字情報・凡例を全て転記
- 図の前に `### 図N: タイトル` のように見出しを付ける

# 数式・記号
- 数式は markdown 数式記法 ($...$ または $$...$$) で表現
- 単位 (％, 円, 人, 件, ㎡ など) を必ず保持

# 箇条書き
- `-` または `1.` を使用
- インデントは2スペース

PDFの全情報を漏らさず markdown 化することを最優先とする。
"""


def convert(pdf_path: Path, md_path: Path) -> None:
    client = genai.Client(vertexai=True, project=PROJECT, location=LOCATION)
    pdf_bytes = pdf_path.read_bytes()
    size_mb = len(pdf_bytes) / 1024 / 1024
    print(f"[{pdf_path.name}] size={size_mb:.1f}MB", flush=True)

    t0 = time.time()
    resp = client.models.generate_content(
        model=MODEL,
        contents=[
            types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
            PROMPT,
        ],
        config=types.GenerateContentConfig(
            temperature=0.0,
            max_output_tokens=64000,
        ),
    )
    text = resp.text or ""
    finish = ""
    try:
        finish = str(resp.candidates[0].finish_reason)
    except Exception:
        pass
    if text.startswith("```markdown"):
        text = text.split("\n", 1)[1]
    if text.endswith("```"):
        text = text.rsplit("\n", 1)[0]
    if not text.strip():
        raise RuntimeError(
            f"empty response (finish={finish}, "
            f"prompt_tokens={getattr(resp.usage_metadata, 'prompt_token_count', '?')}, "
            f"thought_tokens={getattr(resp.usage_metadata, 'thoughts_token_count', '?')})"
        )
    md_path.write_text(text, encoding="utf-8")
    print(
        f"[{pdf_path.name}] -> {md_path.name} "
        f"{len(text)} chars in {time.time() - t0:.1f}s finish={finish}",
        flush=True,
    )


def main() -> int:
    pdf = Path(sys.argv[1])
    md = Path(sys.argv[2])
    md.parent.mkdir(parents=True, exist_ok=True)
    convert(pdf, md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
