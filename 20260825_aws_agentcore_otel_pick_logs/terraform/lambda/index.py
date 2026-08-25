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


def _collect(group: str, trace_id: str, start_ms: int) -> list[str]:
    lines = []
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
            lines.append(
                json.dumps(
                    {"logGroup": group, "message": message}, ensure_ascii=False
                )
            )
        token = resp.get("nextToken")
        if not token:
            return lines


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
        lines = []
        for group in (SPANS_GROUP, RUNTIME_GROUP):
            lines.extend(_collect(group, tid, start_ms))
        key = time.strftime("%Y-%m-%d/") + f"{tid}.jsonl"
        s3.put_object(
            Bucket=BUCKET,
            Key=key,
            Body=("\n".join(lines) + "\n").encode("utf-8"),
            ContentType="application/x-ndjson",
        )
        dumped.append({"traceId": tid, "key": key, "records": len(lines)})

    print(json.dumps({"dumped": dumped}, ensure_ascii=False))
    return {"dumped": dumped}
