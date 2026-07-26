"""構成B 実験: Step Functions Local (port 8083) のスモークテスト.

CreateStateMachine → StartExecution → GetExecutionHistory の一連が動くか確認する.
"""

import json

import boto3

ENDPOINT = "http://localhost:8083"
REGION = "us-east-1"


def client():
    return boto3.client(
        "stepfunctions",
        endpoint_url=ENDPOINT,
        region_name=REGION,
        aws_access_key_id="dummy",
        aws_secret_access_key="dummy",
    )


SMOKE_ASL = {
    "Comment": "smoke: Pass のみ",
    "StartAt": "Hello",
    "States": {
        "Hello": {
            "Type": "Pass",
            "Result": {"message": "hello from sfn local"},
            "End": True,
        }
    },
}


def main() -> None:
    sfn = client()
    resp = sfn.create_state_machine(
        name="smoke",
        definition=json.dumps(SMOKE_ASL),
        roleArn="arn:aws:iam::123456789012:role/DummyRole",
        type="STANDARD",
    )
    sm_arn = resp["stateMachineArn"]
    print("stateMachineArn:", sm_arn)

    ex = sfn.start_execution(
        stateMachineArn=sm_arn, name="smoke-1", input=json.dumps({"in": 1})
    )
    ex_arn = ex["executionArn"]
    print("executionArn:", ex_arn)

    import time

    for _ in range(20):
        desc = sfn.describe_execution(executionArn=ex_arn)
        if desc["status"] != "RUNNING":
            break
        time.sleep(0.5)
    print("status:", desc["status"])
    print("output:", desc.get("output"))

    hist = sfn.get_execution_history(executionArn=ex_arn)
    for ev in hist["events"]:
        print(ev["id"], ev["type"])


if __name__ == "__main__":
    main()
