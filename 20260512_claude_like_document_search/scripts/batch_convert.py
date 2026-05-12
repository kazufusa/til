"""pdfs/ 配下の全 PDF を並列で markdown 化して docs/ に出力する."""
from __future__ import annotations

import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from pdf_to_md import convert  # noqa: E402


def task(pdf: Path, out_dir: Path) -> tuple[str, bool, str]:
    md = out_dir / (pdf.name + ".md")  # 元ファイル名.pdf.md 形式
    if md.exists() and md.stat().st_size > 0:
        return (pdf.name, True, "skip (exists)")
    try:
        convert(pdf, md)
        return (pdf.name, True, f"{md.stat().st_size} bytes")
    except Exception as e:
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
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {ex.submit(task, p, out_dir): p for p in pdfs}
        for fut in as_completed(futures):
            results.append(fut.result())

    ok = sum(1 for _, s, _ in results if s)
    print(f"\n=== done in {time.time() - t0:.1f}s: {ok}/{len(results)} ok ===")
    for name, success, msg in results:
        if not success:
            print(f"FAIL {name}: {msg}")
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
