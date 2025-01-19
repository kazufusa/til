from google.cloud import run_v2
from google.cloud.run_v2.types.condition import Condition
import os

project_id = os.getenv("GCLOUD_ID")
execution_name = os.getenv("EXECUTION_NAME")

def execute():
    client = run_v2.JobsClient()
    request = run_v2.RunJobRequest(
        name=f"projects/{project_id}/locations/asia-northeast1/jobs/job",
        overrides = {"container_overrides": [{"env": [{"name": "AAA", "value": "aaa"}]}]}
    )
    operation = client.run_job(request=request)
    return operation.metadata.name

def get_status(name: str) -> Condition.State:
    # print(name)
    client = run_v2.ExecutionsClient()
    execution = client.get_execution(name=name)
    status = next(filter(lambda x: x.type_=="Completed", execution.conditions), None)
    # https://cloud.google.com/php/docs/reference/cloud-run/latest/V2.Condition.State
    # Condition.State.STATE_UNSPECIFIED
    # Condition.State.CONDITION_PENDING
    # Condition.State.CONDITION_RECONCILING
    # Condition.State.CONDITION_FAILED
    # Condition.State.CONDITION_SUCCEEDED
    return status.status

if __name__ == "__main__":
    # execution_name = execute()
    get_status(execution_name)
