"""切り落とし判定用のprompt_payload生成と、共通の引数定義。"""

import argparse

GATE_MIN_LENGTH = {"pass": 1, "fail": 1_000_000}

_FILLER = "検証用のダミー資料行です。この行は切り落とし判定のための目印になります。"


def build_prompt_payload(lines: int) -> str:
    """行番号マーカー付きのpayloadを生成する。1行およそ64文字。

    末尾にPAYLOAD-ENDマーカーを付け、記録側で切断位置を特定できるようにする。
    """
    rows = [f"PAYLOAD-LINE-{i:06d} {_FILLER}" for i in range(1, lines + 1)]
    if rows:
        rows[-1] += " PAYLOAD-END"
    return "\n".join(rows)


def add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--gate", choices=["pass", "fail"], required=True,
                        help="gateの成否。passでしきい値1、failでしきい値1000000")
    parser.add_argument("--payload-lines", type=int, default=3,
                        help="prompt_payloadのマーカー行数(1行約64文字)")
    parser.add_argument("--topic", default="OpenTelemetryの分散トレーシング",
                        help="writerに渡す題材")


def build_invoke_payload(args: argparse.Namespace) -> dict:
    return {
        "topic": args.topic,
        "prompt_payload": build_prompt_payload(args.payload_lines),
        "gate_min_length": GATE_MIN_LENGTH[args.gate],
    }
