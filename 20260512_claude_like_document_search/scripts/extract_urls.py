"""documents.csv をパースして url + file_name + domain のペアを TSV で出力する.

Hugging Face の allganize/RAG-Evaluation-Dataset-JA に同梱されている
documents.csv (65 PDF の URL/タイトル/出典の一覧) を、後段の download.sh が
扱いやすい TSV に整形する.

usage:
    curl -sL <documents.csv の URL> -o /tmp/documents.csv
    python scripts/extract_urls.py /tmp/documents.csv urls.tsv

出力フォーマット (TSV、ヘッダ無し):
    <url>\t<file_name>\t<domain>
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path


def main() -> int:
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    with src.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = [(r["url"], r["file_name"], r["domain"]) for r in reader]
    with dst.open("w", encoding="utf-8") as f:
        for url, name, domain in rows:
            f.write(f"{url}\t{name}\t{domain}\n")
    print(f"wrote {len(rows)} rows to {dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
