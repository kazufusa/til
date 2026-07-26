"""構成B 実験: lambda:invoke.waitForTaskToken パターンの実測 (SFN Local + LAMBDA_ENDPOINT モック).

前提: sfn-local コンテナが -e LAMBDA_ENDPOINT=http://172.17.0.1:9001 付きで起動済み、
exp07_mock_lambda.py が port 9001 で稼働中.

検証:
- $$.Task.Token が Payload に注入されて Lambda (モック) に渡るか
- Lambda が即 return しても実行はトークン待ちで停止し続けるか
- 別プロセスの SendTaskSuccess で再開するか
"""

import json
import subprocess
import sys
import time

import boto3

ENDPOINT = "http://localhost:8083"
CREDS = dict(
    endpoint_url=ENDPOINT,
    region_name="us-east-1",
    aws_access_key_id="dummy",
    aws_secret_access_key="dummy",
)
TOKEN_FILE = "/tmp/exp07_token.json"

ASL = {
    "Comment": "waitForTaskToken via lambda mock",
    "StartAt": "HumanApproval",
    "States": {
        "HumanApproval": {
            "Type": "Task",
            "Resource": "arn:aws:states:::lambda:invoke.waitForTaskToken",
            "Parameters": {
                "FunctionName": "approval-notify",
                "Payload": {
                    "taskToken.$": "$$.Task.Token",
                    "draft.$": "$.draft",
                },
            },
            "TimeoutSeconds": 300,
            "ResultPath": "$.approval",
            "Next": "Done",
        },
        "Done": {"Type": "Pass", "End": True},
    },
}

SEND_SNIPPET = """
import boto3, sys, json
sfn = boto3.client("stepfunctions", endpoint_url="http://localhost:8083",
                   region_name="us-east-1",
                   aws_access_key_id="dummy", aws_secret_access_key="dummy")
sfn.send_task_success(taskToken=sys.argv[1], output=json.dumps({"approved": True, "by": "human-cli"}))
print("sent success")
"""


def main() -> None:
    sfn = boto3.client("stepfunctions", **CREDS)
    sm = sfn.create_state_machine(
        name="wait-for-task-token",
        definition=json.dumps(ASL),
        roleArn="arn:aws:iam::123456789012:role/DummyRole",
        type="STANDARD",
    )
    ex = sfn.start_execution(
        stateMachineArn=sm["stateMachineArn"],
        name="w1",
        input=json.dumps({"draft": "SkyLine X1 announcement v1"}),
    )
    ex_arn = ex["executionArn"]
    print("executionArn:", ex_arn)

    # モック lambda がトークンをファイルに書くのを待つ
    token = None
    for _ in range(30):
        try:
            with open(TOKEN_FILE) as f:
                payload = json.load(f)
            token = payload.get("taskToken")
            if token:
                break
        except FileNotFoundError:
            pass
        time.sleep(0.5)
    if not token:
        print("FAILED: token not delivered to mock lambda")
        print("status:", sfn.describe_execution(executionArn=ex_arn)["status"])
        hist = sfn.get_execution_history(executionArn=ex_arn)
        for ev in hist["events"]:
            print(ev["id"], ev["type"], ev.get("taskFailedEventDetails", ""))
        return
    print(f"token delivered to mock lambda, payload draft={payload.get('draft')}")
    print(f"token (head): {token[:40]}...")

    time.sleep(3)
    st = sfn.describe_execution(executionArn=ex_arn)["status"]
    print(f"3s after lambda returned: status={st} (expect RUNNING = still waiting for token)")

    t0 = time.time()
    r = subprocess.run(
        [sys.executable, "-c", SEND_SNIPPET, token],
        capture_output=True, text=True, timeout=30,
    )
    print(f"[other-process] rc={r.returncode} out={r.stdout.strip()} err={r.stderr.strip()[-200:]}")
    status = "RUNNING"
    while status == "RUNNING" and time.time() - t0 < 30:
        status = sfn.describe_execution(executionArn=ex_arn)["status"]
        time.sleep(0.2)
    print(f"status={status} observed {time.time() - t0:.2f}s after SendTaskSuccess")
    desc = sfn.describe_execution(executionArn=ex_arn)
    print("output:", desc.get("output"))

    hist = sfn.get_execution_history(executionArn=ex_arn)
    for ev in hist["events"]:
        detail = ""
        for k in ("taskSubmittedEventDetails", "taskSucceededEventDetails", "taskFailedEventDetails"):
            if k in ev:
                detail = json.dumps(ev[k], ensure_ascii=False)[:150]
        print(ev["id"], ev["type"], detail)
    with open("/tmp/exp07_history.json", "w") as f:
        json.dump(hist["events"], f, ensure_ascii=False, indent=2, default=str)


if __name__ == "__main__":
    main()
