"""exp07 の続き: 既に waitForTaskToken で停止中の実行を別プロセス SendTaskSuccess で再開する."""

import json
import subprocess
import sys
import time

import boto3

CREDS = dict(
    endpoint_url="http://localhost:8083",
    region_name="us-east-1",
    aws_access_key_id="dummy",
    aws_secret_access_key="dummy",
)

SEND = (
    "import boto3, sys, json\n"
    "sfn = boto3.client('stepfunctions', endpoint_url='http://localhost:8083',"
    " region_name='us-east-1', aws_access_key_id='dummy', aws_secret_access_key='dummy')\n"
    "sfn.send_task_success(taskToken=sys.argv[1],"
    " output=json.dumps({'approved': True, 'by': 'human-cli'}))\n"
    "print('sent success')\n"
)


def main() -> None:
    ex_arn = sys.argv[1]
    sfn = boto3.client("stepfunctions", **CREDS)
    payload = json.load(open("/tmp/exp07_token.json"))
    token = payload["taskToken"]
    print("token delivered to mock lambda:", token[:40], "| draft:", payload["draft"])
    print("status before send:", sfn.describe_execution(executionArn=ex_arn)["status"])

    t0 = time.time()
    r = subprocess.run(
        [sys.executable, "-c", SEND, token], capture_output=True, text=True, timeout=30
    )
    print("other-process:", r.returncode, r.stdout.strip(), r.stderr.strip()[-300:])

    status = "RUNNING"
    while status == "RUNNING" and time.time() - t0 < 30:
        status = sfn.describe_execution(executionArn=ex_arn)["status"]
        time.sleep(0.2)
    print(f"status={status} after {time.time() - t0:.2f}s")
    print("output:", sfn.describe_execution(executionArn=ex_arn).get("output"))

    h = sfn.get_execution_history(executionArn=ex_arn)
    for ev in h["events"]:
        d = ""
        for k in ("taskSubmittedEventDetails", "taskSucceededEventDetails"):
            if ev.get(k):
                d = json.dumps(ev[k], ensure_ascii=False)[:150]
        print(ev["id"], ev["type"], d)
    json.dump(
        h["events"],
        open("/tmp/exp07_history_w2.json", "w"),
        default=str,
        ensure_ascii=False,
        indent=2,
    )


if __name__ == "__main__":
    main()
