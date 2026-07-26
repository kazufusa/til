"""構成B 実験: Step Functions Local のタスクトークン (SendTaskSuccess/Failure) 実測.

検証項目:
(a) Activity Task で実行がトークン待ちで停止するか
(b) 別プロセスからの SendTaskSuccess で再開するか (反映までの遅延も実測)
(c) SendTaskFailure + Retry (差戻し) が動くか

Activity 方式はコールバック (タスクトークン + SendTaskSuccess/Failure) と同じ
API 機構を使う. SFN Local はデフォルトで Activity をサポートする.
"""

import json
import subprocess
import sys
import time

import boto3

ENDPOINT = "http://localhost:8083"
REGION = "us-east-1"
CREDS = dict(
    endpoint_url=ENDPOINT,
    region_name=REGION,
    aws_access_key_id="dummy",
    aws_secret_access_key="dummy",
)

SEND_SNIPPET = """
import boto3, sys, json
sfn = boto3.client("stepfunctions", endpoint_url="http://localhost:8083",
                   region_name="us-east-1",
                   aws_access_key_id="dummy", aws_secret_access_key="dummy")
mode, token = sys.argv[1], sys.argv[2]
if mode == "success":
    sfn.send_task_success(taskToken=token, output=json.dumps({"approved": True}))
else:
    sfn.send_task_failure(taskToken=token, error="Rejected", cause="NG: reason from human")
print("sent", mode)
"""


def send_from_other_process(mode: str, token: str) -> None:
    """別プロセス (subprocess) から SendTaskSuccess/Failure を呼ぶ."""
    r = subprocess.run(
        [sys.executable, "-c", SEND_SNIPPET, mode, token],
        capture_output=True,
        text=True,
        timeout=30,
    )
    print(f"  [other-process] rc={r.returncode} out={r.stdout.strip()} err={r.stderr.strip()[-200:]}")


ASL = {
    "Comment": "token semantics: activity task with retry on Rejected",
    "StartAt": "WaitApproval",
    "States": {
        "WaitApproval": {
            "Type": "Task",
            "Resource": "arn:aws:states:us-east-1:123456789012:activity:approval06",
            "TimeoutSeconds": 300,
            "Retry": [
                {"ErrorEquals": ["Rejected"], "IntervalSeconds": 1, "MaxAttempts": 2}
            ],
            "Catch": [
                {"ErrorEquals": ["States.ALL"], "Next": "Escalate", "ResultPath": "$.error"}
            ],
            "Next": "Done",
        },
        "Escalate": {"Type": "Pass", "Result": {"escalated": True}, "End": True},
        "Done": {"Type": "Pass", "End": True},
    },
}


def main() -> None:
    sfn = boto3.client("stepfunctions", **CREDS)

    act = sfn.create_activity(name="approval06")
    act_arn = act["activityArn"]
    print("activityArn:", act_arn)

    sm = sfn.create_state_machine(
        name="token-semantics",
        definition=json.dumps(ASL),
        roleArn="arn:aws:iam::123456789012:role/DummyRole",
        type="STANDARD",
    )
    sm_arn = sm["stateMachineArn"]

    ex = sfn.start_execution(
        stateMachineArn=sm_arn, name="t1", input=json.dumps({"draft": "v1"})
    )
    ex_arn = ex["executionArn"]
    print("executionArn:", ex_arn)

    # --- (a) トークン待ちで停止するか ---
    t0 = time.time()
    task = sfn.get_activity_task(activityArn=act_arn, workerName="worker-a")
    token1 = task["taskToken"]
    print(f"(a) got task token after {time.time() - t0:.2f}s, input={task['input']}")
    time.sleep(2)
    desc = sfn.describe_execution(executionArn=ex_arn)
    print(f"(a) 2s after token fetch, execution status = {desc['status']} (expect RUNNING = paused)")

    # --- (c) SendTaskFailure -> Retry で再スケジュールされるか ---
    print("(c) sending TaskFailure(Rejected) from another process...")
    send_from_other_process("failure", token1)
    t0 = time.time()
    task2 = sfn.get_activity_task(activityArn=act_arn, workerName="worker-a")
    token2 = task2.get("taskToken")
    if token2:
        print(f"(c) retry: new task token issued after {time.time() - t0:.2f}s -> Retry works")
    else:
        print("(c) no retry task within poll window -> Retry NOT observed")
        return

    # --- (b) SendTaskSuccess で再開するか + 反映遅延の実測 ---
    print("(b) sending TaskSuccess from another process...")
    t_send = time.time()
    send_from_other_process("success", token2)
    status = "RUNNING"
    while status == "RUNNING" and time.time() - t_send < 30:
        status = sfn.describe_execution(executionArn=ex_arn)["status"]
        if status != "RUNNING":
            break
        time.sleep(0.2)
    print(f"(b) status={status} observed {time.time() - t_send:.2f}s after SendTaskSuccess")

    hist = sfn.get_execution_history(executionArn=ex_arn, maxResults=100)
    print("--- execution history ---")
    for ev in hist["events"]:
        detail = ""
        for k in ("activityFailedEventDetails", "activitySucceededEventDetails"):
            if k in ev:
                detail = json.dumps(ev[k], ensure_ascii=False)[:120]
        print(ev["id"], ev["type"], detail)

    out = "/tmp/exp06_history.json"
    with open(out, "w") as f:
        json.dump(hist["events"], f, ensure_ascii=False, indent=2, default=str)
    print("history saved:", out)


if __name__ == "__main__":
    main()
