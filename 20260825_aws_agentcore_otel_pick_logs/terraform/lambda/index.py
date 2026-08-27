"""gate FAILスパンを起点に、CloudWatch上の全記録をtraceId単位でS3へ復元するLambda。

トリガー: aws/spansロググループのサブスクリプションフィルタ
("verification_gate" "FAIL")。
"""

import base64
import gzip
import json
import os
import time

import boto3

logs = boto3.client("logs")
s3 = boto3.client("s3")

BUCKET = os.environ["DUMP_BUCKET"]
SPANS_GROUP = os.environ["SPANS_LOG_GROUP"]
RUNTIME_GROUP = os.environ["RUNTIME_LOG_GROUP"]
# トレース完成の確実な信号はないため、待ち時間はヒューリスティック
WAIT_SECONDS = int(os.environ.get("WAIT_SECONDS", "75"))
LOOKBACK_MS = 2 * 60 * 60 * 1000


def _collect(group: str, trace_id: str, start_ms: int) -> list[dict]:
    records = []
    token = None
    while True:
        kwargs = {
            "logGroupName": group,
            "filterPattern": f'"{trace_id}"',
            "startTime": start_ms,
        }
        if token:
            kwargs["nextToken"] = token
        resp = logs.filter_log_events(**kwargs)
        for ev in resp["events"]:
            try:
                message = json.loads(ev["message"])
            except json.JSONDecodeError:
                message = ev["message"]
            records.append({"logGroup": group, "message": message})
        token = resp.get("nextToken")
        if not token:
            return records


def _is_app_record(record: dict) -> bool:
    """アプリ由来の記録だけを残す判定。

    基盤側のシステムスパン(AgentCore.Runtime.Invoke、POST /invocations等)、
    bedrock-runtime自動計装の重複記録、平文ログを落とす。
    """
    message = record["message"]
    if not isinstance(message, dict):
        return False
    if "aws/spans" in record["logGroup"]:
        attrs = message.get("attributes", {})
        return (
            attrs.get("gen_ai.system") == "strands-agents"
            or "gate.result" in attrs
        )
    scope = message.get("scope", {}).get("name", "")
    return scope.startswith("strands.")


def _to_jsonl(records: list[dict]) -> bytes:
    return (
        "\n".join(json.dumps(r, ensure_ascii=False) for r in records) + "\n"
    ).encode("utf-8")


def handler(event, context):
    payload = json.loads(gzip.decompress(base64.b64decode(event["awslogs"]["data"])))
    trace_ids = set()
    for ev in payload.get("logEvents", []):
        try:
            record = json.loads(ev["message"])
        except json.JSONDecodeError:
            continue
        if record.get("attributes", {}).get("gate.result") == "FAIL":
            tid = record.get("traceId")
            if tid:
                trace_ids.add(tid)
    if not trace_ids:
        return {"dumped": []}

    time.sleep(WAIT_SECONDS)
    start_ms = int(time.time() * 1000) - LOOKBACK_MS

    dumped = []
    for tid in trace_ids:
        records = []
        for group in (SPANS_GROUP, RUNTIME_GROUP):
            records.extend(_collect(group, tid, start_ms))
        app_records = [r for r in records if _is_app_record(r)]

        # raw(全量の証跡)とapp(システム記録を削った閲覧用)の2ファイルを書く
        prefix = time.strftime("%Y-%m-%d/")
        for suffix, target in (("jsonl", records), ("app.jsonl", app_records)):
            s3.put_object(
                Bucket=BUCKET,
                Key=f"{prefix}{tid}.{suffix}",
                Body=_to_jsonl(target),
                ContentType="application/x-ndjson",
            )
        dumped.append(
            {"traceId": tid, "raw": len(records), "app": len(app_records)}
        )

    print(json.dumps({"dumped": dumped}, ensure_ascii=False))
    return {"dumped": dumped}
