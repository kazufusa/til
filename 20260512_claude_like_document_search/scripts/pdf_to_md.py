"""PDF を Vertex AI Gemini で markdown 化する.

このスクリプトは「PDF を RAG 用の markdown に落とす前段パイプライン」の中核.
1 PDF を 1 回 Vertex AI に投げ、構造を保ったまま markdown を生成して保存する.
batch_convert.py が並列でこれを呼ぶ.

使い方:
    python scripts/pdf_to_md.py pdfs/foo.pdf docs/foo.pdf.md

環境変数:
    GOOGLE_VERTEX_PROJECT   Vertex AI を使う GCP project id (必須)
    GOOGLE_VERTEX_LOCATION  リージョン (default: global)
    CDCS_PDF_MODEL          利用モデル (default: gemini-3.1-flash-lite-preview)

ハマりどころ:
- "no pages" 400 エラー: 中身が PDF ではなく HTML (Access Denied 等) の場合に起きる.
  対策: file pdfs/*.pdf で確認、再ダウンロード.
- "RECITATION" finish_reason: モデルが公開情報の長文引用と判断して空応答を返すケース.
  対策: retry_failed.py の ALT_PROMPT で別言い回しを試す.
- "MAX_TOKENS": 大型 PDF (>50p) で起きうる. max_output_tokens を 64k に設定済み.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from google import genai
from google.genai import types


def _require_env(name: str) -> str:
    """必須環境変数の取得. 未設定なら親切なメッセージで落ちる."""
    v = os.environ.get(name)
    if not v:
        raise SystemExit(
            f"環境変数 {name} を設定してください "
            f"(.env を参照、または `export {name}=...`)"
        )
    return v


# project id はリポジトリにベタ書きしない方針なので必ず env から取得.
PROJECT = _require_env("GOOGLE_VERTEX_PROJECT")
# global は新しい Vertex AI のグローバルエンドポイント. リージョン特定不要で課金対象も統一.
LOCATION = os.environ.get("GOOGLE_VERTEX_LOCATION", "global")
# 既定モデル. 切り替えたい場合は CDCS_PDF_MODEL=gemini-3.1-flash 等を渡す.
MODEL = os.environ.get("CDCS_PDF_MODEL", "gemini-3.1-flash-lite-preview")

# ---------------------------------------------------------------------------
# 変換プロンプト. RAG 用 markdown 抽出の方針を細かく書いている.
#
# このプロンプトのチューニング履歴:
# - v1: 「構造を保って markdown 化」だけ → 図表のデータが要約されて落ちた.
# - v2 (現状): 図表のデータを表として再構成、要約禁止、を明示.
#   → グラフから年度ごとの値が表で取れるようになり、検索精度が大きく向上.
#
# 注意: プロンプト変更時は 1 PDF で品質確認してから batch_convert を回すこと.
# ---------------------------------------------------------------------------
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
    """1 PDF を markdown に変換して md_path に書き出す.

    Vertex AI Gemini に PDF バイト列を直接マルチモーダル入力として渡す.
    temperature=0 で出力ブレを抑え、max_output_tokens=64000 で長文 PDF にも対応.
    """
    # 毎回 Client を作る. 並列実行でも問題ない (内部で接続再利用).
    client = genai.Client(vertexai=True, project=PROJECT, location=LOCATION)
    pdf_bytes = pdf_path.read_bytes()
    size_mb = len(pdf_bytes) / 1024 / 1024
    print(f"[{pdf_path.name}] size={size_mb:.1f}MB", flush=True)

    t0 = time.time()
    resp = client.models.generate_content(
        model=MODEL,
        contents=[
            # PDF バイト列をそのまま入力. Gemini が内部で OCR/レイアウト解析を行う.
            types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
            PROMPT,
        ],
        config=types.GenerateContentConfig(
            temperature=0.0,        # 安定再現性を優先
            max_output_tokens=64000,  # 長大 PDF (>30 ページ) でも切れにくいよう余裕を持つ
        ),
    )
    text = resp.text or ""
    # finish_reason を取って後段のデバッグに使う (STOP/MAX_TOKENS/RECITATION/SAFETY 等).
    finish = ""
    try:
        finish = str(resp.candidates[0].finish_reason)
    except Exception:
        pass
    # 「禁止」と書いてもモデルが ```markdown フェンスで返してくる事があるので剥がす.
    if text.startswith("```markdown"):
        text = text.split("\n", 1)[1]
    if text.endswith("```"):
        text = text.rsplit("\n", 1)[0]
    if not text.strip():
        # 空応答は呼び出し側にエラーを投げて retry_failed.py で拾わせる.
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
