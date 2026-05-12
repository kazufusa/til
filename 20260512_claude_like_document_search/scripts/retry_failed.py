"""失敗した PDF を個別にリトライする.

batch_convert.py の出力ファイルが存在しない / 空の PDF を対象に再変換する.

戦略:
- フェーズ 1: 通常プロンプト (PROMPT) で 2 回まで.
              温度を 0.2 → 0.4 と段階的に上げる. 同じ出力が出にくくなる.
              "no pages" のような transient なエラーはこれで解消することが多い.
- フェーズ 2: ALT_PROMPT に切り替えて 3 回まで.
              Gemini の RECITATION (公開情報の長文引用と判定して空応答) を回避するため、
              「言い回しを変えて」と指示する.

使い方:
    python scripts/retry_failed.py                       # docs/ に欠けている全 PDF
    python scripts/retry_failed.py pdfs/foo.pdf ...     # 個別指定
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

from google import genai
from google.genai import types

sys.path.insert(0, str(Path(__file__).parent))
from pdf_to_md import PROJECT, LOCATION, MODEL, PROMPT  # noqa: E402

# RECITATION 用の代替プロンプト: 「言い回しを変えて」要素を入れて
# Gemini の recitation detector を回避
ALT_PROMPT = (
    PROMPT
    + "\n\n# 追加指示\n"
    + "原文の言い回しをそのまま長く引用するのではなく、"
    + "情報を保持したまま markdown 用に再構成・要点列挙する形式に整えてください。"
    + "数値・固有名詞・日付などのファクトは全て残してください。"
)


def attempt(pdf: Path, md: Path, prompt: str, retries: int = 3) -> bool:
    """1 PDF を `retries` 回まで変換試行する.

    各試行で temperature を上げて (0.2 → 0.4 → 0.6) 出力の多様性を確保.
    成功で True、全リトライ失敗で False.
    """
    client = genai.Client(vertexai=True, project=PROJECT, location=LOCATION)
    pdf_bytes = pdf.read_bytes()
    for i in range(retries):
        try:
            t0 = time.time()
            resp = client.models.generate_content(
                model=MODEL,
                contents=[
                    types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    temperature=0.2 + 0.2 * i,  # リトライで温度上げる
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
                print(
                    f"  attempt {i + 1} empty (finish={finish}); retrying", flush=True
                )
                continue
            md.write_text(text, encoding="utf-8")
            print(
                f"  OK {len(text)} chars in {time.time() - t0:.1f}s "
                f"(temp={0.2 + 0.2 * i:.1f}, finish={finish})",
                flush=True,
            )
            return True
        except Exception as e:
            msg = str(e)
            print(f"  attempt {i + 1} error: {msg[:200]}", flush=True)
            time.sleep(2)
    return False


def main() -> int:
    docs = Path("docs")
    pdfs = Path("pdfs")
    failed: list[str] = []

    # 引数が与えられればそれを対象、無ければ「docs に対応する .md が無い PDF」を自動検出.
    if len(sys.argv) > 1:
        targets = [Path(p) for p in sys.argv[1:]]
    else:
        targets = []
        for p in sorted(pdfs.glob("*.pdf")):
            md = docs / (p.name + ".md")
            if not md.exists() or md.stat().st_size == 0:
                targets.append(p)

    print(f"retrying {len(targets)} files", flush=True)
    for pdf in targets:
        md = docs / (pdf.name + ".md")
        print(f"[{pdf.name}]", flush=True)
        # まず通常プロンプトでリトライ (no pages は transient)
        if attempt(pdf, md, PROMPT, retries=2):
            continue
        # ダメなら ALT_PROMPT (RECITATION 回避)
        print("  switching to ALT_PROMPT", flush=True)
        if attempt(pdf, md, ALT_PROMPT, retries=3):
            continue
        failed.append(pdf.name)

    print(f"\n=== retry done: {len(targets) - len(failed)}/{len(targets)} ok ===")
    for n in failed:
        print(f"FAIL {n}")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
