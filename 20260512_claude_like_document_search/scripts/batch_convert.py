"""pdfs/ 配下の全 PDF を並列で markdown 化して docs/ に出力する.

使い方:
    python scripts/batch_convert.py

設計:
- 単一 PDF 変換は scripts/pdf_to_md.py の convert() に委譲.
- 4 並列の ThreadPoolExecutor で回す (Vertex AI 側のレート制限を見つつの妥当値).
- ファイル名は <元 PDF 名>.md ではなく <元 PDF 名>.pdf.md (拡張子も保持).
  ベンチマークの target_file_name (`01.pdf`) と 1 対 1 で照合できるようにするため.
- 既に出力ファイルが存在しサイズ > 0 ならスキップ. 再実行で進捗を持ち越せる.
- 失敗は traceback を残して結果リストに格納. 末尾でまとめて FAIL 一覧を表示.
"""
from __future__ import annotations

import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# scripts/ ディレクトリを sys.path に入れて pdf_to_md を import する
sys.path.insert(0, str(Path(__file__).parent))
from pdf_to_md import convert  # noqa: E402


def task(pdf: Path, out_dir: Path) -> tuple[str, bool, str]:
    """1 PDF を変換する worker タスク."""
    # 出力ファイル名は <元名>.pdf.md (元拡張子もそのまま保持)
    md = out_dir / (pdf.name + ".md")
    # 既に変換済みならスキップ (size 0 のゴミファイルは作り直す)
    if md.exists() and md.stat().st_size > 0:
        return (pdf.name, True, "skip (exists)")
    try:
        convert(pdf, md)
        return (pdf.name, True, f"{md.stat().st_size} bytes")
    except Exception as e:
        # スタックトレースは即時 stderr に流す (進捗確認しやすいように)
        traceback.print_exc()
        return (pdf.name, False, repr(e))


def main() -> int:
    pdf_dir = Path("pdfs")
    out_dir = Path("docs")
    out_dir.mkdir(exist_ok=True)
    pdfs = sorted(pdf_dir.glob("*.pdf"))
    print(f"converting {len(pdfs)} PDFs with 4 workers", flush=True)

    t0 = time.time()
    results: list[tuple[str, bool, str]] = []
    # max_workers=4 は Vertex AI の同時リクエスト数とレート制限のバランスから経験則的に選択
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(task, p, out_dir): p for p in pdfs}
        for fut in as_completed(futures):
            results.append(fut.result())

    ok = sum(1 for _, s, _ in results if s)
    print(f"\n=== done in {time.time() - t0:.1f}s: {ok}/{len(results)} ok ===")
    # 失敗ファイルだけを最後にまとめて表示 (retry_failed.py の入力候補になる)
    for name, success, msg in results:
        if not success:
            print(f"FAIL {name}: {msg}")
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
