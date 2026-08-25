#!/usr/bin/env python3
"""クラウド実行: デプロイ済みAgentCore Runtimeを呼び出す。

使い方:
    uv run --project app scripts/invoke.py --gate fail --payload-lines 800

Runtime ARNは--arn、環境変数AGENT_RUNTIME_ARN、
app/.bedrock_agentcore.yamlの順で探す。
"""

import argparse
import json
import os
import sys
import uuid
from pathlib import Path

import boto3

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from payload_util import add_common_args, build_invoke_payload

REGION = os.environ.get("AWS_REGION", "ap-northeast-1")


def resolve_runtime_arn(cli_arn: str | None) -> str:
    if cli_arn:
        return cli_arn
    if os.environ.get("AGENT_RUNTIME_ARN"):
        return os.environ["AGENT_RUNTIME_ARN"]
    config = ROOT / "app" / ".bedrock_agentcore.yaml"
    if config.exists():
        for line in config.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped.startswith("agent_arn:"):
                arn = stripped.split(":", 1)[1].strip().strip("\"'")
                if arn:
                    return arn
    raise SystemExit(
        "Runtime ARNが見つかりません。--arnかAGENT_RUNTIME_ARNで指定してください。"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    add_common_args(parser)
    parser.add_argument("--arn", help="AgentCore RuntimeのARN")
    args = parser.parse_args()

    arn = resolve_runtime_arn(args.arn)
    payload = build_invoke_payload(args)
    session_id = f"til-otel-{uuid.uuid4().hex}"  # 33文字以上の要件を満たす

    client = boto3.client("bedrock-agentcore", region_name=REGION)
    response = client.invoke_agent_runtime(
        agentRuntimeArn=arn,
        runtimeSessionId=session_id,
        payload=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
    )

    body = response["response"].read().decode("utf-8")
    try:
        parsed = json.loads(body)
        print(json.dumps(
            {"session_id": session_id, "response": parsed},
            ensure_ascii=False, indent=2,
        ))
    except json.JSONDecodeError:
        print(json.dumps({"session_id": session_id, "raw": body}, ensure_ascii=False))


if __name__ == "__main__":
    main()
