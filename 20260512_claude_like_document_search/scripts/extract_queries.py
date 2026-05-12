"""rag_evaluation_result.csv から評価質問を抽出して queries.json に保存する.

allganize/RAG-Evaluation-Dataset-JA に含まれる 300 件の評価質問のうち、
**本リポジトリの docs/ に取り込み済みの PDF に紐づくもの** だけを残す.
取得できなかった PDF (METI 系等) に紐づく質問は除外.

各エントリは question / target_answer / target_md (期待される根拠ファイル) /
target_page_no / domain / type (paragraph or image) を持つ.

type="image" は元 PDF の図表からの抽出を要求する質問. RAG にとって難しい.

usage:
    curl -sL <rag_evaluation_result.csv の URL> -o /tmp/eval.csv
    python scripts/extract_queries.py /tmp/eval.csv queries.json
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path


def main() -> int:
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])

    docs_dir = Path("docs")
    available_pdf = {p.name.replace(".pdf.md", ".pdf") for p in docs_dir.glob("*.pdf.md")}

    rows: list[dict[str, object]] = []
    with src.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            target = r.get("target_file_name") or ""
            if target not in available_pdf:
                continue
            rows.append(
                {
                    "question": r.get("question", "").strip(),
                    "target_answer": r.get("target_answer", "").strip(),
                    "target_file": target,
                    "target_md": f"docs/{target}.md",
                    "target_page_no": r.get("target_page_no", ""),
                    "domain": r.get("domain", ""),
                    "type": r.get("type", ""),
                }
            )

    by_domain: dict[str, int] = {}
    for r in rows:
        d = str(r.get("domain", ""))
        by_domain[d] = by_domain.get(d, 0) + 1

    dst.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"wrote {len(rows)} queries to {dst}")
    print("by domain:", by_domain)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
