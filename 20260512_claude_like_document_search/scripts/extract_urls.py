"""documents.csv をパースして url + file_name のペアを TSV で出力する."""
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
